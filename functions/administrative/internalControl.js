const admin = require("firebase-admin");
const {HttpsError} = require("firebase-functions/v2/https");
const {addAuditToTransaction} = require("./audit");

const COLLECTION = "internalControlRecords";
const TYPES = [
  "checklist", "recommendation", "actionPlan", "finding", "risk",
  "evidence", "limit",
];

const internalControlHandlers = {
  saveRecord: {
    permission: "relatorios.gerenciar",
    execute: async ({db, request, actor, payload}) => {
      const type = String(payload.type || "");
      if (!TYPES.includes(type)) {
        throw new HttpsError("invalid-argument", "Tipo de registro inválido.");
      }
      const data = payload.data && typeof payload.data === "object" ?
        payload.data : {};
      const recordId = String(payload.id || "");
      const reference = recordId ? db.collection(COLLECTION).doc(recordId) :
        db.collection(COLLECTION).doc();
      const now = admin.firestore.FieldValue.serverTimestamp();
      let before = null;
      let auditAfter = null;
      await db.runTransaction(async (transaction) => {
        const previous = recordId ? await transaction.get(reference) : null;
        if (previous && !previous.exists) {
          throw new HttpsError("not-found", "Registro não encontrado.");
        }
        before = previous?.data() || null;
        const record = {
          ...Object.fromEntries(Object.entries(data).filter(([key]) => [
            "title", "description", "area", "responsibleName", "dueAt",
            "status", "severity", "reference", "evidenceUrl", "period",
            "value", "legalLimit", "probability", "impact",
          ].includes(key))),
          type,
          status: payload.archive ? "archived" :
            String(data.status || before?.status || "open"),
          createdBy: before?.createdBy || actor.userId,
          createdByName: before?.createdByName || actor.name,
          createdAt: before?.createdAt || now,
          updatedBy: actor.userId,
          updatedByName: actor.name,
          updatedAt: now,
        };
        auditAfter = {...record, createdAt: null, updatedAt: null};
        transaction.set(reference, record);
        addAuditToTransaction({
          db,
          transaction,
          timestamp: now,
          actor,
          moduleId: "relatorios",
          action: payload.archive ? "RECORD_ARCHIVED" :
            (before ? "RECORD_UPDATED" : "RECORD_CREATED"),
          entityType: type,
          entityId: reference.id,
          before,
          after: auditAfter,
          request,
        });
      });
      return {id: reference.id};
    },
  },
};

module.exports = {internalControlHandlers};
