/* eslint-disable max-len */
const {HttpsError} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const {addAuditToTransaction} = require("./audit");
const {nextIdentifierInTransaction} = require("./counters");

const requiredText = (value, label) => {
  const result = String(value || "").trim();
  if (!result) throw new HttpsError("invalid-argument", `Informe ${label}.`);
  return result;
};
const positive = (value, label) => {
  const result = Number(value);
  if (!Number.isFinite(result) || result <= 0) throw new HttpsError("invalid-argument", `${label} deve ser maior que zero.`);
  return result;
};
const nonNegative = (value, label) => {
  const result = Number(value || 0);
  if (!Number.isFinite(result) || result < 0) throw new HttpsError("invalid-argument", `${label} inválido.`);
  return result;
};
const balanceId = (warehouseId, productId) => `${warehouseId}_${productId}`;

const createProduct = async ({db, request, actor, payload}) => {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const reference = db.collection("inventoryProducts").doc();
  const record = {
    code: requiredText(payload.code, "o código"), description: requiredText(payload.description, "a descrição"),
    category: String(payload.category || "").trim(), unit: requiredText(payload.unit, "a unidade"), brand: String(payload.brand || "").trim(),
    minimumStock: nonNegative(payload.minimumStock, "Estoque mínimo"), maximumStock: nonNegative(payload.maximumStock, "Estoque máximo"),
    currentStock: 0, averageValue: 0, active: true, createdBy: actor.userId, createdByName: actor.name, createdAt: now, updatedAt: now,
  };
  await db.runTransaction(async (transaction) => {
    const duplicate = await transaction.get(db.collection("inventoryProducts").where("code", "==", record.code).limit(1));
    if (!duplicate.empty) throw new HttpsError("already-exists", "Já existe um produto com este código.");
    transaction.create(reference, record);
    addAuditToTransaction({db, transaction, timestamp: now, actor, moduleId: "almoxarifado", action: "PRODUCT_CREATED", entityType: "inventoryProduct", entityId: reference.id, after: record, request});
  });
  return {id: reference.id};
};

const createWarehouse = async ({db, request, actor, payload}) => {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const reference = db.collection("inventoryWarehouses").doc();
  const record = {name: requiredText(payload.name, "o nome do depósito"), code: requiredText(payload.code, "o código"), location: String(payload.location || "").trim(), responsibleId: String(payload.responsibleId || ""), responsibleName: String(payload.responsibleName || "").trim(), active: true, createdAt: now, updatedAt: now};
  await db.runTransaction(async (transaction) => {
    transaction.create(reference, record);
    addAuditToTransaction({db, transaction, timestamp: now, actor, moduleId: "almoxarifado", action: "WAREHOUSE_CREATED", entityType: "inventoryWarehouse", entityId: reference.id, after: record, request});
  });
  return {id: reference.id};
};

const recordMovement = async ({db, request, actor, payload}) => {
  const type = String(payload.type || "");
  if (!["entry", "exit", "transfer", "return", "loss", "adjustment"].includes(type)) throw new HttpsError("invalid-argument", "Tipo de movimentação inválido.");
  const productId = requiredText(payload.productId, "o produto");
  const warehouseId = requiredText(payload.warehouseId, "o depósito");
  const destinationWarehouseId = String(payload.destinationWarehouseId || "");
  if (type === "transfer" && (!destinationWarehouseId || destinationWarehouseId === warehouseId)) throw new HttpsError("invalid-argument", "Informe um depósito de destino diferente.");
  const quantity = positive(payload.quantity, "Quantidade");
  const unitValue = nonNegative(payload.unitValue, "Valor unitário");
  const now = admin.firestore.FieldValue.serverTimestamp();
  const movementRef = db.collection("inventoryMovements").doc();
  await db.runTransaction(async (transaction) => {
    const productRef = db.collection("inventoryProducts").doc(productId);
    const originRef = db.collection("inventoryBatches").doc(balanceId(warehouseId, productId));
    const destinationRef = type === "transfer" ? db.collection("inventoryBatches").doc(balanceId(destinationWarehouseId, productId)) : null;
    const reads = await Promise.all([transaction.get(productRef), transaction.get(originRef), destinationRef ? transaction.get(destinationRef) : Promise.resolve(null)]);
    if (!reads[0].exists) throw new HttpsError("not-found", "Produto não encontrado.");
    const product = reads[0].data();
    const originBalance = Number(reads[1].data()?.quantity || 0);
    const isAddition = ["entry", "return"].includes(type);
    const isRemoval = ["exit", "loss", "transfer"].includes(type);
    const delta = type === "adjustment" ? quantity - originBalance : isAddition ? quantity : -quantity;
    if (isRemoval && originBalance < quantity) throw new HttpsError("failed-precondition", "Estoque insuficiente no depósito selecionado.");
    const resultingTotal = Number(product.currentStock || 0) + delta;
    if (resultingTotal < 0) throw new HttpsError("failed-precondition", "A movimentação deixaria o estoque negativo.");
    transaction.set(originRef, {warehouseId, productId, quantity: originBalance + delta, updatedAt: now}, {merge: true});
    if (destinationRef) transaction.set(destinationRef, {warehouseId: destinationWarehouseId, productId, quantity: Number(reads[2]?.data()?.quantity || 0) + quantity, updatedAt: now}, {merge: true});
    const averageValue = isAddition && unitValue > 0 ? ((Number(product.currentStock || 0) * Number(product.averageValue || 0)) + (quantity * unitValue)) / Math.max(1, resultingTotal) : Number(product.averageValue || 0);
    transaction.update(productRef, {currentStock: resultingTotal, averageValue, updatedAt: now});
    const record = {type, productId, productCode: product.code, productDescription: product.description, warehouseId, destinationWarehouseId, quantity, unitValue, supplierName: String(payload.supplierName || ""), invoiceNumber: String(payload.invoiceNumber || ""), contractId: String(payload.contractId || ""), commitment: String(payload.commitment || ""), lot: String(payload.lot || ""), expiresAt: payload.expiresAt ? admin.firestore.Timestamp.fromDate(new Date(payload.expiresAt)) : null, reason: String(payload.reason || ""), createdBy: actor.userId, createdByName: actor.name, createdAt: now};
    transaction.create(movementRef, record);
    addAuditToTransaction({db, transaction, timestamp: now, actor, moduleId: "almoxarifado", action: "STOCK_MOVEMENT_CREATED", entityType: "inventoryMovement", entityId: movementRef.id, after: record, request});
  });
  return {id: movementRef.id};
};

const createRequest = async ({db, request, actor, payload}) => {
  const items = Array.isArray(payload.items) ? payload.items.filter((item) => item.productId && Number(item.quantity) > 0).map((item) => ({productId: String(item.productId), productDescription: String(item.productDescription || ""), quantity: positive(item.quantity, "Quantidade"), deliveredQuantity: 0})) : [];
  if (!items.length) throw new HttpsError("invalid-argument", "Adicione pelo menos um material à requisição.");
  const now = admin.firestore.FieldValue.serverTimestamp(); const year = new Date().getFullYear();
  const result = await db.runTransaction(async (transaction) => {
    const generated = await nextIdentifierInTransaction({db, transaction, prefix: "REQ", year, timestamp: now});
    const reference = db.collection("materialRequests").doc();
    const record = {identifier: generated.identifier, year, sequence: generated.sequence, requesterId: actor.userId, requesterName: actor.name, departmentId: actor.departmentId || String(payload.departmentId || ""), departmentName: String(payload.departmentName || ""), warehouseId: requiredText(payload.warehouseId, "o depósito de atendimento"), justification: requiredText(payload.justification, "a justificativa"), items, status: "requested", createdAt: now, updatedAt: now};
    transaction.create(reference, record);
    addAuditToTransaction({db, transaction, timestamp: now, actor, moduleId: "almoxarifado", action: "MATERIAL_REQUEST_CREATED", entityType: "materialRequest", entityId: reference.id, after: record, request});
    return {id: reference.id, identifier: generated.identifier};
  });
  return result;
};

const transitionRequest = async ({db, request, actor, payload}) => {
  const transitions = {requested: ["awaiting_authorization"], awaiting_authorization: ["authorized", "cancelled"], authorized: ["separating"], separating: ["delivered"], delivered: ["received"]};
  const id = requiredText(payload.id, "a requisição"); const nextStatus = requiredText(payload.status, "a situação");
  const reference = db.collection("materialRequests").doc(id); const now = admin.firestore.FieldValue.serverTimestamp();
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference); if (!snapshot.exists) throw new HttpsError("not-found", "Requisição não encontrada.");
    if (!transitions[snapshot.data().status]?.includes(nextStatus)) throw new HttpsError("failed-precondition", "Transição de situação não permitida.");
    const requestData = snapshot.data();
    const deliveryRows = [];
    if (nextStatus === "delivered") {
      for (const item of requestData.items || []) {
        const productRef = db.collection("inventoryProducts").doc(item.productId);
        const balanceRef = db.collection("inventoryBatches").doc(balanceId(requestData.warehouseId, item.productId));
        const [productSnapshot, balanceSnapshot] = await Promise.all([transaction.get(productRef), transaction.get(balanceRef)]);
        const quantity = Number(item.quantity || 0); const balance = Number(balanceSnapshot.data()?.quantity || 0);
        if (!productSnapshot.exists || balance < quantity) throw new HttpsError("failed-precondition", `Estoque insuficiente para ${item.productDescription}.`);
        deliveryRows.push({item, quantity, balance, productRef, balanceRef, product: productSnapshot.data()});
      }
    }
    deliveryRows.forEach(({item, quantity, balance, productRef, balanceRef, product}) => {
      transaction.set(balanceRef, {warehouseId: requestData.warehouseId, productId: item.productId, quantity: balance - quantity, updatedAt: now}, {merge: true});
      transaction.update(productRef, {currentStock: Number(product.currentStock || 0) - quantity, updatedAt: now});
      const movementRef = db.collection("inventoryMovements").doc();
      transaction.create(movementRef, {type: "exit", reason: `Entrega da requisição ${requestData.identifier}`, requestId: id, productId: item.productId, productCode: product.code, productDescription: product.description, warehouseId: requestData.warehouseId, destinationWarehouseId: "", quantity, unitValue: Number(product.averageValue || 0), createdBy: actor.userId, createdByName: actor.name, createdAt: now});
    });
    const updates = {status: nextStatus, updatedAt: now, [`${nextStatus}At`]: now, [`${nextStatus}By`]: actor.userId};
    transaction.update(reference, updates);
    addAuditToTransaction({db, transaction, timestamp: now, actor, moduleId: "almoxarifado", action: "MATERIAL_REQUEST_STATUS_CHANGED", entityType: "materialRequest", entityId: id, before: {status: snapshot.data().status}, after: {status: nextStatus}, request});
  });
  return {id, status: nextStatus};
};

const inventoryHandlers = {
  createProduct: {permission: "almoxarifado.gerenciar", execute: createProduct},
  createWarehouse: {permission: "almoxarifado.gerenciar", execute: createWarehouse},
  recordMovement: {permission: "almoxarifado.movimentar", execute: recordMovement},
  createRequest: {permission: "almoxarifado.solicitar", execute: createRequest},
  transitionRequest: {permission: "almoxarifado.autorizar", execute: transitionRequest},
};

module.exports = {inventoryHandlers, balanceId};
