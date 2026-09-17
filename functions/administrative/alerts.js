/* eslint-disable max-len */
const admin = require("firebase-admin");

const dayKey = () => new Date().toISOString().slice(0, 10);
const limitDate = (days) => admin.firestore.Timestamp.fromMillis(Date.now() + days * 86400000);

const getAdmins = async (db) => {
  const snapshot = await db.collection("users").where("tipo", "in", ["Admin", "Administrador"]).limit(50).get();
  return snapshot.docs.map((doc) => ({id: doc.id, data: doc.data()}));
};
const putNotification = async ({db, recipientId, key, title, message, data}) => {
  if (!recipientId) return;
  await db.collection("notifications").doc(`administrative_${key}_${recipientId}`).set({userId: recipientId, targetUserId: recipientId, tituloNotification: title, descricaoNotification: message, message, source: "administrative-alerts", read: false, isRead: false, createdAt: admin.firestore.FieldValue.serverTimestamp(), timestamp: admin.firestore.FieldValue.serverTimestamp(), data}, {merge: true});
};
const recipients = async ({db, userId}) => userId ? [userId] : (await getAdmins(db)).map((item) => item.id);
const notify = async ({db, userId, key, title, message, data}) => Promise.all((await recipients({db, userId})).map((recipientId) => putNotification({db, recipientId, key, title, message, data})));

const moduleEnabled = (settings, moduleId) => settings?.modules?.[moduleId]?.admin === true;
const sweepAdministrativeAlerts = async (db, settings = {}) => {
  const today = dayKey(); const [contracts, products, vehicles, plans] = await Promise.all([
    db.collection("contracts").where("status", "==", "active").get(),
    db.collection("inventoryProducts").where("active", "==", true).get(),
    db.collection("fleetVehicles").where("status", "==", "active").get(),
    db.collection("maintenancePlans").where("active", "==", true).get(),
  ]);
  const jobs = [];
  if (moduleEnabled(settings, "contratos")) {
    contracts.docs.forEach((doc) => {
      const item = doc.data(); const end = item.endsAt?.toMillis?.(); if (end && end >= Date.now() && end <= limitDate(60).toMillis()) jobs.push(notify({db, userId: item.managerId || item.inspectorId, key: `contract-expiry_${doc.id}_${today}`, title: "Contrato próximo do vencimento", message: `${item.identifier || item.contractNumber} vence em breve.`, data: {module: "contratos", contractId: doc.id, type: "contract_expiry"}}));
    });
  }
  if (moduleEnabled(settings, "almoxarifado")) {
    products.docs.forEach((doc) => {
      const item = doc.data(); if (Number(item.currentStock || 0) <= Number(item.minimumStock || 0)) jobs.push(notify({db, key: `low-stock_${doc.id}_${today}`, title: "Estoque mínimo atingido", message: `${item.description} está com ${item.currentStock || 0} ${item.unit || "unidade(s)"} em estoque.`, data: {module: "almoxarifado", productId: doc.id, type: "low_stock"}}));
    });
  }
  if (moduleEnabled(settings, "frotas")) {
    vehicles.docs.forEach((doc) => {
      const item = doc.data(); [["registrationExpiresAt", "Licenciamento"], ["insuranceExpiresAt", "Seguro"], ["inspectionDueAt", "Revisão"]].forEach(([field, label]) => {
        const expiresAt = item[field]?.toMillis?.(); if (expiresAt && expiresAt >= Date.now() && expiresAt <= limitDate(30).toMillis()) jobs.push(notify({db, key: `fleet-${field}_${doc.id}_${today}`, title: `${label} próximo do vencimento`, message: `${item.plate} — ${item.description} requer atenção.`, data: {module: "frotas", vehicleId: doc.id, type: `fleet_${field}`}}));
      });
    });
  }
  if (moduleEnabled(settings, "manutencao")) {
    plans.docs.forEach((doc) => {
      const item = doc.data(); const next = item.nextAt?.toMillis?.(); if (next && next >= Date.now() && next <= limitDate(7).toMillis()) jobs.push(notify({db, userId: item.responsibleId, key: `preventive_${doc.id}_${today}`, title: "Manutenção preventiva próxima", message: `${item.title} deve ser executada em breve.`, data: {module: "manutencao", planId: doc.id, type: "preventive_due"}}));
    });
  }
  await Promise.all(jobs); return {createdOrUpdated: jobs.length};
};
module.exports = {sweepAdministrativeAlerts};
