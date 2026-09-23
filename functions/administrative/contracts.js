/* eslint-disable max-len */
const {HttpsError} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const {addAuditToTransaction} = require("./audit");
const {nextIdentifierInTransaction} = require("./counters");

const text = (value, field, required = false) => {
  const normalized = String(value || "").trim();
  if (required && !normalized) throw new HttpsError("invalid-argument", `Informe ${field}.`);
  return normalized;
};

const number = (value, field) => {
  const normalized = Number(value || 0);
  if (!Number.isFinite(normalized) || normalized < 0) throw new HttpsError("invalid-argument", `${field} inválido.`);
  return normalized;
};

const date = (value, field, required = false) => {
  if (!value && !required) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new HttpsError("invalid-argument", `${field} inválida.`);
  return admin.firestore.Timestamp.fromDate(parsed);
};

const createContract = async ({db, request, actor, payload}) => {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const year = new Date().getFullYear();
  const contract = {
    contractNumber: text(payload.contractNumber, "o número do contrato", true),
    administrativeProcess: text(payload.administrativeProcess, "o processo administrativo"),
    object: text(payload.object, "o objeto", true),
    supplierName: text(payload.supplierName, "o fornecedor", true),
    supplierDocument: text(payload.supplierDocument, "o CPF/CNPJ"),
    supplierRepresentative: text(payload.supplierRepresentative, "o representante"),
    initialValue: number(payload.initialValue, "Valor inicial"),
    currentValue: number(payload.initialValue, "Valor inicial"),
    executedValue: 0,
    signatureDate: date(payload.signatureDate, "Data de assinatura"),
    startsAt: date(payload.startsAt, "Data inicial", true),
    endsAt: date(payload.endsAt, "Data final", true),
    managerId: text(payload.managerId, "o gestor"),
    managerName: text(payload.managerName, "o gestor"),
    inspectorId: text(payload.inspectorId, "o fiscal titular"),
    inspectorName: text(payload.inspectorName, "o fiscal titular"),
    substituteInspectorId: text(payload.substituteInspectorId, "o fiscal substituto"),
    substituteInspectorName: text(payload.substituteInspectorName, "o fiscal substituto"),
    departmentIds: Array.isArray(payload.departmentIds) ? payload.departmentIds.map(String) : [],
    resourceSource: text(payload.resourceSource, "a fonte de recursos"),
    commitmentData: text(payload.commitmentData, "os dados do empenho"),
    procurementOrigin: text(payload.procurementOrigin, "a origem da contratação"),
    notes: text(payload.notes, "as observações"),
    status: "active",
    pendingCount: 0,
    openOccurrenceCount: 0,
    createdBy: actor.userId,
    createdByName: actor.name,
    createdAt: now,
    updatedAt: now,
  };
  if (contract.endsAt.toMillis() < contract.startsAt.toMillis()) throw new HttpsError("invalid-argument", "A vigência final deve ser posterior à inicial.");
  const result = await db.runTransaction(async (transaction) => {
    const generated = await nextIdentifierInTransaction({db, transaction, prefix: "CTR", year, timestamp: now});
    const reference = db.collection("contracts").doc();
    const after = {...contract, identifier: generated.identifier, year, sequence: generated.sequence};
    transaction.create(reference, after);
    addAuditToTransaction({db, transaction, timestamp: now, actor, moduleId: "contratos", action: "CONTRACT_CREATED", entityType: "contract", entityId: reference.id, after, request});
    return {id: reference.id, identifier: generated.identifier};
  });
  return result;
};

const updateContract = async ({db, request, actor, payload}) => {
  const id = text(payload.id, "o contrato", true);
  const reference = db.collection("contracts").doc(id);
  const allowed = ["object", "supplierRepresentative", "managerId", "managerName", "inspectorId", "inspectorName", "substituteInspectorId", "substituteInspectorName", "resourceSource", "commitmentData", "procurementOrigin", "notes", "status"];
  const updates = Object.fromEntries(allowed.filter((key) => payload[key] !== undefined).map((key) => [key, typeof payload[key] === "string" ? payload[key].trim() : payload[key]]));
  if (payload.endsAt) updates.endsAt = date(payload.endsAt, "Data final", true);
  if (!Object.keys(updates).length) throw new HttpsError("invalid-argument", "Nenhuma alteração informada.");
  const now = admin.firestore.FieldValue.serverTimestamp();
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) throw new HttpsError("not-found", "Contrato não encontrado.");
    updates.updatedAt = now;
    transaction.update(reference, updates);
    addAuditToTransaction({db, transaction, timestamp: now, actor, moduleId: "contratos", action: "CONTRACT_UPDATED", entityType: "contract", entityId: id, before: snapshot.data(), after: updates, request});
  });
  return {id, ok: true};
};

const importContracts = async ({db, request, actor, payload}) => {
  if (!Array.isArray(payload.contracts) || payload.contracts.length === 0 || payload.contracts.length > 100) {
    throw new HttpsError("invalid-argument", "Envie entre 1 e 100 contratos.");
  }
  const created = [];
  for (const contract of payload.contracts) {
    created.push(await createContract({db, request, actor, payload: contract}));
  }
  return {created, count: created.length};
};

const addContractRecord = ({collectionName, action, status, valueField = null}) => async ({db, request, actor, payload}) => {
  const contractId = text(payload.contractId, "o contrato", true);
  const reference = db.collection("contracts").doc(contractId);
  const child = reference.collection(collectionName).doc();
  const now = admin.firestore.FieldValue.serverTimestamp();
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) throw new HttpsError("not-found", "Contrato não encontrado.");
    const record = {...payload, id: child.id, contractId, status, createdBy: actor.userId, createdByName: actor.name, createdAt: now, updatedAt: now};
    delete record.action;
    if (valueField) record[valueField] = number(payload[valueField], "Valor");
    transaction.create(child, record);
    const updates = {updatedAt: now};
    if (collectionName === "occurrences") updates.openOccurrenceCount = admin.firestore.FieldValue.increment(1);
    if (collectionName === "measurements") updates.executedValue = admin.firestore.FieldValue.increment(record.measuredValue);
    transaction.update(reference, updates);
    addAuditToTransaction({db, transaction, timestamp: now, actor, moduleId: "contratos", action, entityType: collectionName, entityId: child.id, after: record, request});
  });
  return {id: child.id, ok: true};
};

const reviewSupplierSignature = async ({db, request, actor, payload}) => {
  const contractId = text(payload.contractId, "o contrato", true);
  const documentId = text(payload.documentId, "o documento", true);
  const returnId = text(payload.returnId, "a via assinada", true);
  const decision = text(payload.decision, "a decisão", true);
  if (!["accept", "request_resubmission"].includes(decision)) {
    throw new HttpsError("invalid-argument", "Decisão inválida.");
  }
  const note = text(payload.note, "a observação");
  const contractRef = db.collection("contracts").doc(contractId);
  const documentRef = contractRef.collection("documents").doc(documentId);
  const returnRef = documentRef.collection("supplierReturns").doc(returnId);
  const now = admin.firestore.FieldValue.serverTimestamp();
  await db.runTransaction(async (transaction) => {
    const [contractSnapshot, documentSnapshot, returnSnapshot] = await Promise.all([
      transaction.get(contractRef), transaction.get(documentRef),
      transaction.get(returnRef),
    ]);
    if (!contractSnapshot.exists || !documentSnapshot.exists || !returnSnapshot.exists) {
      throw new HttpsError("not-found", "Documento ou via assinada não encontrado.");
    }
    const signatureDocument = documentSnapshot.data();
    const signedReturn = returnSnapshot.data();
    if (!signatureDocument.requiresSupplierSignature ||
      signedReturn.supplierCnpj !== contractSnapshot.data().supplierDocument) {
      throw new HttpsError("failed-precondition", "A via não pertence a este fluxo de assinatura.");
    }
    const accepted = decision === "accept";
    const returnUpdates = {
      status: accepted ? "accepted" : "resubmission_requested",
      reviewedAt: now,
      reviewedBy: actor.userId,
      reviewedByName: actor.name,
      reviewNote: note,
    };
    const documentUpdates = {
      signatureStatus: accepted ? "signed" : "awaiting_supplier",
      supplierUploadAllowed: !accepted,
      lastSupplierReturnId: returnId,
      signatureReviewedAt: now,
      updatedAt: now,
    };
    transaction.update(returnRef, returnUpdates);
    transaction.update(documentRef, documentUpdates);
    addAuditToTransaction({
      db, transaction, timestamp: now, actor, moduleId: "contratos",
      action: accepted ? "SUPPLIER_SIGNATURE_ACCEPTED" : "SUPPLIER_SIGNATURE_RESUBMISSION_REQUESTED",
      entityType: "contract_document", entityId: documentId,
      before: {signatureStatus: signatureDocument.signatureStatus,
        returnStatus: signedReturn.status},
      after: {...documentUpdates, ...returnUpdates, note}, request,
    });
  });
  return {id: documentId, ok: true};
};

const contractHandlers = {
  create: {permission: "contratos.criar", execute: createContract},
  update: {permission: "contratos.editar", execute: updateContract},
  import: {permission: "contratos.criar", execute: importContracts},
  addInspection: {permission: "contratos.fiscalizar", execute: addContractRecord({collectionName: "inspections", action: "INSPECTION_CREATED", status: "completed"})},
  addOccurrence: {permission: "contratos.fiscalizar", execute: addContractRecord({collectionName: "occurrences", action: "OCCURRENCE_CREATED", status: "open"})},
  addMeasurement: {permission: "contratos.atestar", execute: addContractRecord({collectionName: "measurements", action: "MEASUREMENT_CREATED", status: "awaiting_review", valueField: "measuredValue"})},
  addObligation: {permission: "contratos.gerenciar", execute: addContractRecord({collectionName: "obligations", action: "OBLIGATION_CREATED", status: "active"})},
  addDocument: {permission: "contratos.editar", execute: addContractRecord({collectionName: "documents", action: "CONTRACT_DOCUMENT_ADDED", status: "active"})},
  reviewSupplierSignature: {permission: "contratos.editar", execute: reviewSupplierSignature},
};

module.exports = {contractHandlers, createContract, updateContract};
