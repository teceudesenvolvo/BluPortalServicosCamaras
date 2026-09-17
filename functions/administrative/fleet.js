/* eslint-disable max-len */
const {HttpsError} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const {addAuditToTransaction} = require("./audit");

const required = (value, label) => {
  const result = String(value || "").trim();
  if (!result) throw new HttpsError("invalid-argument", `Informe ${label}.`);
  return result;
};
const numeric = (value, label) => {
  const result = Number(value || 0);
  if (!Number.isFinite(result) || result < 0) throw new HttpsError("invalid-argument", `${label} inválido.`);
  return result;
};
const date = (value, label, mandatory = false) => {
  if (!value && !mandatory) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new HttpsError("invalid-argument", `${label} inválida.`);
  return admin.firestore.Timestamp.fromDate(parsed);
};

const createVehicle = async ({db, request, actor, payload}) => {
  const now = admin.firestore.FieldValue.serverTimestamp(); const reference = db.collection("fleetVehicles").doc();
  const record = {plate: required(payload.plate, "a placa").toUpperCase(), description: required(payload.description, "a identificação"), brand: String(payload.brand || ""), model: String(payload.model || ""), year: String(payload.year || ""), color: String(payload.color || ""), fuelType: String(payload.fuelType || ""), currentMileage: numeric(payload.currentMileage, "Quilometragem"), assetId: String(payload.assetId || ""), assetIdentifier: String(payload.assetIdentifier || ""), departmentId: String(payload.departmentId || ""), departmentName: String(payload.departmentName || ""), status: "active", registrationExpiresAt: date(payload.registrationExpiresAt, "Licenciamento"), insuranceExpiresAt: date(payload.insuranceExpiresAt, "Seguro"), inspectionDueAt: date(payload.inspectionDueAt, "Revisão"), createdAt: now, updatedAt: now, createdBy: actor.userId, createdByName: actor.name};
  await db.runTransaction(async (transaction) => {
    const duplicate = await transaction.get(db.collection("fleetVehicles").where("plate", "==", record.plate).limit(1)); if (!duplicate.empty) throw new HttpsError("already-exists", "Já existe veículo com esta placa."); transaction.create(reference, record); addAuditToTransaction({db, transaction, timestamp: now, actor, moduleId: "frotas", action: "VEHICLE_CREATED", entityType: "fleetVehicle", entityId: reference.id, after: record, request});
  }); return {id: reference.id};
};

const createDriver = async ({db, request, actor, payload}) => {
  const now = admin.firestore.FieldValue.serverTimestamp(); const reference = db.collection("fleetDrivers").doc(); const record = {name: required(payload.name, "o nome"), userId: String(payload.userId || ""), licenseNumber: required(payload.licenseNumber, "a CNH"), licenseCategory: String(payload.licenseCategory || ""), licenseExpiresAt: date(payload.licenseExpiresAt, "Vencimento da CNH"), active: true, createdAt: now, updatedAt: now}; await db.runTransaction(async (transaction) => {
    transaction.create(reference, record); addAuditToTransaction({db, transaction, timestamp: now, actor, moduleId: "frotas", action: "DRIVER_CREATED", entityType: "fleetDriver", entityId: reference.id, after: record, request});
  }); return {id: reference.id};
};

const createEvent = async ({db, request, actor, payload}) => {
  const kinds = {fueling: "fleetFuelings", maintenance: "fleetMaintenance", incident: "fleetIncidents", fine: "fleetFines", document: "fleetDocuments"}; const kind = String(payload.kind || ""); if (!kinds[kind]) throw new HttpsError("invalid-argument", "Registro de frota inválido."); const vehicleId = required(payload.vehicleId, "o veículo"); const now = admin.firestore.FieldValue.serverTimestamp(); const vehicleRef = db.collection("fleetVehicles").doc(vehicleId); const reference = db.collection(kinds[kind]).doc();
  await db.runTransaction(async (transaction) => {
    const vehicle = await transaction.get(vehicleRef); if (!vehicle.exists) throw new HttpsError("not-found", "Veículo não encontrado."); const mileage = numeric(payload.mileage, "Quilometragem"); if (mileage && mileage < Number(vehicle.data().currentMileage || 0)) throw new HttpsError("failed-precondition", "A quilometragem não pode ser inferior à registrada no veículo."); const record = {vehicleId, plate: vehicle.data().plate, vehicleDescription: vehicle.data().description, kind, occurredAt: payload.occurredAt ? date(payload.occurredAt, "Data", true) : now, mileage, quantity: numeric(payload.quantity, "Quantidade"), amount: numeric(payload.amount, "Valor"), supplierName: String(payload.supplierName || ""), description: required(payload.description, "a descrição"), createdAt: now, createdBy: actor.userId, createdByName: actor.name}; transaction.create(reference, record); if (mileage) transaction.update(vehicleRef, {currentMileage: mileage, updatedAt: now}); addAuditToTransaction({db, transaction, timestamp: now, actor, moduleId: "frotas", action: "FLEET_EVENT_CREATED", entityType: kind, entityId: reference.id, after: record, request});
  }); return {id: reference.id};
};
const fleetHandlers = {createVehicle: {permission: "frotas.gerenciar", execute: createVehicle}, createDriver: {permission: "frotas.gerenciar", execute: createDriver}, createEvent: {permission: "frotas.registrar", execute: createEvent}};
module.exports = {fleetHandlers};
