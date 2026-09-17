/* eslint-disable max-len */
const {HttpsError} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const {addAuditToTransaction} = require("./audit");
const {nextIdentifierInTransaction} = require("./counters");

const required = (value, label) => {
  const result = String(value || "").trim();
  if (!result) throw new HttpsError("invalid-argument", `Informe ${label}.`);
  return result;
};
const validNumber = (value, label) => {
  const result = Number(value || 0);
  if (!Number.isFinite(result) || result < 0) throw new HttpsError("invalid-argument", `${label} inválido.`);
  return result;
};

const createTicket = async ({db, request, actor, payload}) => {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const year = new Date().getFullYear();
  return db.runTransaction(async (transaction) => {
    const generated = await nextIdentifierInTransaction({db, transaction, prefix: "MAN", year, timestamp: now});
    const reference = db.collection("maintenanceTickets").doc();
    const record = {identifier: generated.identifier, year, sequence: generated.sequence, assetId: String(payload.assetId || ""), assetIdentifier: String(payload.assetIdentifier || ""), assetDescription: String(payload.assetDescription || ""), subject: required(payload.subject, "o problema"), description: required(payload.description, "a descrição"), priority: ["low", "normal", "high", "urgent"].includes(payload.priority) ? payload.priority : "normal", departmentId: actor.departmentId || String(payload.departmentId || ""), departmentName: String(payload.departmentName || ""), status: "open", requesterId: actor.userId, requesterName: actor.name, createdAt: now, updatedAt: now};
    transaction.create(reference, record);
    addAuditToTransaction({db, transaction, timestamp: now, actor, moduleId: "manutencao", action: "MAINTENANCE_TICKET_CREATED", entityType: "maintenanceTicket", entityId: reference.id, after: record, request});
    return {id: reference.id, identifier: generated.identifier};
  });
};

const createWorkOrder = async ({db, request, actor, payload}) => {
  const ticketId = required(payload.ticketId, "o chamado");
  const now = admin.firestore.FieldValue.serverTimestamp(); const year = new Date().getFullYear();
  return db.runTransaction(async (transaction) => {
    const ticketRef = db.collection("maintenanceTickets").doc(ticketId); const ticket = await transaction.get(ticketRef);
    if (!ticket.exists) throw new HttpsError("not-found", "Chamado não encontrado.");
    const generated = await nextIdentifierInTransaction({db, transaction, prefix: "OS", year, timestamp: now}); const reference = db.collection("maintenanceWorkOrders").doc();
    const record = {identifier: generated.identifier, year, sequence: generated.sequence, ticketId, assetId: ticket.data().assetId || "", assetIdentifier: ticket.data().assetIdentifier || "", assetDescription: ticket.data().assetDescription || "", subject: ticket.data().subject, technicianId: String(payload.technicianId || ""), technicianName: String(payload.technicianName || ""), supplierName: String(payload.supplierName || ""), contractId: String(payload.contractId || ""), diagnosis: String(payload.diagnosis || ""), status: "open", materials: Array.isArray(payload.materials) ? payload.materials : [], estimatedCost: validNumber(payload.estimatedCost, "Custo estimado"), createdAt: now, updatedAt: now, createdBy: actor.userId, createdByName: actor.name};
    transaction.create(reference, record); transaction.update(ticketRef, {status: "assigned", workOrderId: reference.id, updatedAt: now});
    addAuditToTransaction({db, transaction, timestamp: now, actor, moduleId: "manutencao", action: "WORK_ORDER_CREATED", entityType: "maintenanceWorkOrder", entityId: reference.id, after: record, request});
    return {id: reference.id, identifier: generated.identifier};
  });
};

const transitionWorkOrder = async ({db, request, actor, payload}) => {
  const transitions = {open: ["triage", "assigned"], triage: ["assigned"], assigned: ["in_progress", "awaiting_material", "awaiting_supplier"], in_progress: ["completed"], awaiting_material: ["in_progress"], awaiting_supplier: ["in_progress"], completed: ["validated"], validated: ["closed"]};
  const id = required(payload.id, "a ordem de serviço"); const status = required(payload.status, "a situação"); const now = admin.firestore.FieldValue.serverTimestamp(); const reference = db.collection("maintenanceWorkOrders").doc(id);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference); if (!snapshot.exists) throw new HttpsError("not-found", "Ordem de serviço não encontrada."); if (!transitions[snapshot.data().status]?.includes(status)) throw new HttpsError("failed-precondition", "Transição de situação não permitida."); const updates = {status, updatedAt: now, [`${status}At`]: now, [`${status}By`]: actor.userId}; if (payload.diagnosis !== undefined) updates.diagnosis = String(payload.diagnosis || ""); if (payload.serviceExecuted !== undefined) updates.serviceExecuted = String(payload.serviceExecuted || ""); if (payload.actualCost !== undefined) updates.actualCost = validNumber(payload.actualCost, "Custo"); transaction.update(reference, updates); addAuditToTransaction({db, transaction, timestamp: now, actor, moduleId: "manutencao", action: "WORK_ORDER_STATUS_CHANGED", entityType: "maintenanceWorkOrder", entityId: id, before: {status: snapshot.data().status}, after: updates, request});
  });
  return {id, status};
};

const createPlan = async ({db, request, actor, payload}) => {
  const now = admin.firestore.FieldValue.serverTimestamp(); const reference = db.collection("maintenancePlans").doc(); const frequencyDays = Number(payload.frequencyDays || 0);
  if (!Number.isFinite(frequencyDays) || frequencyDays < 1) throw new HttpsError("invalid-argument", "Informe a periodicidade em dias.");
  const nextAt = payload.nextAt ? admin.firestore.Timestamp.fromDate(new Date(payload.nextAt)) : admin.firestore.Timestamp.fromMillis(Date.now() + frequencyDays * 86400000);
  const record = {assetId: String(payload.assetId || ""), assetIdentifier: String(payload.assetIdentifier || ""), title: required(payload.title, "o título"), description: String(payload.description || ""), frequencyDays, checklist: String(payload.checklist || ""), responsibleId: String(payload.responsibleId || ""), responsibleName: String(payload.responsibleName || ""), contractId: String(payload.contractId || ""), nextAt, active: true, createdAt: now, updatedAt: now};
  await db.runTransaction(async (transaction) => {
    transaction.create(reference, record); addAuditToTransaction({db, transaction, timestamp: now, actor, moduleId: "manutencao", action: "PREVENTIVE_PLAN_CREATED", entityType: "maintenancePlan", entityId: reference.id, after: record, request});
  });
  return {id: reference.id};
};

const maintenanceHandlers = {createTicket: {permission: "manutencao.solicitar", execute: createTicket}, createWorkOrder: {permission: "manutencao.gerenciar", execute: createWorkOrder}, transitionWorkOrder: {permission: "manutencao.executar", execute: transitionWorkOrder}, createPlan: {permission: "manutencao.gerenciar", execute: createPlan}};
module.exports = {maintenanceHandlers};
