/* eslint-disable max-len */
const enabled = (settings, id) => settings.modules?.[id]?.admin === true;
const toOption = (snapshot, label) => snapshot.docs.map((doc) => ({id: doc.id, label: label(doc.data()), ...doc.data()}));
const getOptions = async ({db, settings, source, ownModule}) => {
  const sources = String(source || "").split(",").filter(Boolean);
  const result = {};
  for (const item of sources) {
    if (!enabled(settings, item)) continue;
    if (item === "patrimonio") {
      const snapshot = await db.collection("assets").where("status", "in", ["active", "maintenance", "loaned"]).limit(200).get();
      result.assets = toOption(snapshot, (value) => `${value.tombNumber || value.identifier} — ${value.description}`);
    }
    if (item === "contratos") {
      const snapshot = await db.collection("contracts").where("status", "==", "active").limit(200).get();
      result.contracts = toOption(snapshot, (value) => `${value.identifier} — ${value.supplierName}`);
    }
    if (item === "almoxarifado") {
      const [products, warehouses] = await Promise.all([
        db.collection("inventoryProducts").where("active", "==", true).limit(200).get(),
        db.collection("inventoryWarehouses").where("active", "==", true).limit(100).get(),
      ]);
      result.products = toOption(products, (value) => `${value.code} — ${value.description}`);
      result.warehouses = toOption(warehouses, (value) => value.name);
    }
    if (item === "manutencao") {
      const snapshot = await db.collection("maintenanceWorkOrders").where("status", "in", ["open", "triage", "assigned", "in_progress", "awaiting_material", "awaiting_supplier"]).limit(200).get();
      result.workOrders = toOption(snapshot, (value) => `${value.identifier} — ${value.subject}`);
    }
  }
  return {moduleId: ownModule, options: result};
};

const integrationHandlers = (moduleId) => ({
  integrationOptions: {
    permission: `${moduleId}.visualizar`,
    execute: ({db, settings, payload}) => getOptions({db, settings, source: payload.source, ownModule: moduleId}),
  },
});

module.exports = {integrationHandlers, getOptions};
