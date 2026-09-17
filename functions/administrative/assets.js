/* eslint-disable max-len */
const {HttpsError} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const {addAuditToTransaction} = require("./audit");
const {nextIdentifierInTransaction} = require("./counters");

const required = (value, label) => {
  const result = String(value || "").trim(); if (!result) throw new HttpsError("invalid-argument", `Informe ${label}.`); return result;
};
const value = (input, label) => {
  const result = Number(input || 0); if (!Number.isFinite(result) || result < 0) throw new HttpsError("invalid-argument", `${label} inválido.`); return result;
};
const timestamp = (input, label, requiredDate = false) => {
  if (!input && !requiredDate) return null; const parsed = new Date(input); if (Number.isNaN(parsed.getTime())) throw new HttpsError("invalid-argument", `${label} inválida.`); return admin.firestore.Timestamp.fromDate(parsed);
};

const createAsset = async ({db, request, actor, payload}) => {
  const now = admin.firestore.FieldValue.serverTimestamp(); const year = new Date().getFullYear();
  const result = await db.runTransaction(async (transaction) => {
    const generated = await nextIdentifierInTransaction({db, transaction, prefix: "PAT", year, timestamp: now, digits: 6}); const reference = db.collection("assets").doc();
    const record = {identifier: generated.identifier, tombNumber: payload.tombNumber ? String(payload.tombNumber).trim() : generated.identifier, description: required(payload.description, "a descrição"), category: String(payload.category || "").trim(), brand: String(payload.brand || "").trim(), model: String(payload.model || "").trim(), serialNumber: String(payload.serialNumber || "").trim(), acquisitionValue: value(payload.acquisitionValue, "Valor"), acquisitionDate: timestamp(payload.acquisitionDate, "Data de aquisição"), supplierName: String(payload.supplierName || "").trim(), invoiceNumber: String(payload.invoiceNumber || "").trim(), departmentId: String(payload.departmentId || ""), departmentName: String(payload.departmentName || "").trim(), location: String(payload.location || "").trim(), responsibleId: String(payload.responsibleId || ""), responsibleName: String(payload.responsibleName || "").trim(), conservationState: String(payload.conservationState || "good"), status: "active", qrCode: `asset:${reference.id}`, createdAt: now, updatedAt: now, createdBy: actor.userId, createdByName: actor.name};
    transaction.create(reference, record); addAuditToTransaction({db, transaction, timestamp: now, actor, moduleId: "patrimonio", action: "ASSET_CREATED", entityType: "asset", entityId: reference.id, after: record, request}); return {id: reference.id, identifier: generated.identifier, tombNumber: record.tombNumber};
  }); return result;
};

const moveAsset = async ({db, request, actor, payload}) => {
  const id = required(payload.assetId, "o bem"); const type = required(payload.type, "o tipo de movimentação");
  if (!["transfer", "loan", "maintenance", "return", "writeoff"].includes(type)) throw new HttpsError("invalid-argument", "Tipo de movimentação inválido.");
  const now = admin.firestore.FieldValue.serverTimestamp(); const assetRef = db.collection("assets").doc(id); const movementRef = db.collection("assetMovements").doc();
  await db.runTransaction(async (transaction) => {
    const asset = await transaction.get(assetRef); if (!asset.exists) throw new HttpsError("not-found", "Bem não encontrado."); const before = asset.data(); const nextStatus = type === "maintenance" ? "maintenance" : type === "writeoff" ? "written_off" : type === "loan" ? "loaned" : "active"; const updates = {status: nextStatus, updatedAt: now}; if (payload.departmentId !== undefined) updates.departmentId = String(payload.departmentId || ""); if (payload.departmentName !== undefined) updates.departmentName = String(payload.departmentName || ""); if (payload.location !== undefined) updates.location = String(payload.location || ""); if (payload.responsibleId !== undefined) updates.responsibleId = String(payload.responsibleId || ""); if (payload.responsibleName !== undefined) updates.responsibleName = String(payload.responsibleName || ""); const record = {assetId: id, assetIdentifier: before.identifier, type, reason: String(payload.reason || ""), fromDepartmentId: before.departmentId || "", fromDepartmentName: before.departmentName || "", toDepartmentId: updates.departmentId ?? before.departmentId ?? "", toDepartmentName: updates.departmentName ?? before.departmentName ?? "", responsibleId: updates.responsibleId ?? before.responsibleId ?? "", responsibleName: updates.responsibleName ?? before.responsibleName ?? "", createdAt: now, createdBy: actor.userId, createdByName: actor.name}; transaction.update(assetRef, updates); transaction.create(movementRef, record); addAuditToTransaction({db, transaction, timestamp: now, actor, moduleId: "patrimonio", action: "ASSET_MOVED", entityType: "asset", entityId: id, before, after: updates, request});
  }); return {id: movementRef.id};
};

const createInventory = async ({db, request, actor, payload}) => {
  const now = admin.firestore.FieldValue.serverTimestamp(); const year = new Date().getFullYear();
  return db.runTransaction(async (transaction) => {
    const generated = await nextIdentifierInTransaction({db, transaction, prefix: "INV", year, timestamp: now}); const reference = db.collection("assetInventories").doc(); const record = {identifier: generated.identifier, year, sequence: generated.sequence, name: required(payload.name, "o nome do inventário"), departmentIds: Array.isArray(payload.departmentIds) ? payload.departmentIds.map(String) : [], status: "open", startedAt: now, createdBy: actor.userId, createdByName: actor.name, createdAt: now, updatedAt: now}; transaction.create(reference, record); addAuditToTransaction({db, transaction, timestamp: now, actor, moduleId: "patrimonio", action: "INVENTORY_CREATED", entityType: "assetInventory", entityId: reference.id, after: record, request}); return {id: reference.id, identifier: generated.identifier};
  });
};

const assetsHandlers = {createAsset: {permission: "patrimonio.criar", execute: createAsset}, moveAsset: {permission: "patrimonio.movimentar", execute: moveAsset}, createInventory: {permission: "patrimonio.inventariar", execute: createInventory}};
module.exports = {assetsHandlers};
