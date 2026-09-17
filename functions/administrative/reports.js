const admin = require("firebase-admin");
const {addAuditToTransaction} = require("./audit");

const reportHandlers = (moduleId) => ({
  registerExport: {
    permission: `${moduleId}.visualizar`,
    execute: async ({db, request, actor, payload}) => {
      const now = admin.firestore.FieldValue.serverTimestamp();
      const reference = db.collection("administrativeExports").doc();
      const record = {
        moduleId,
        reportName: String(payload.reportName || "Relatório"),
        format: String(payload.format || "csv"),
        rowCount: Number(payload.rowCount || 0),
        requestedBy: actor.userId,
        requestedByName: actor.name,
        createdAt: now,
      };
      await db.runTransaction(async (transaction) => {
        transaction.create(reference, record);
        addAuditToTransaction({
          db,
          transaction,
          timestamp: now,
          actor,
          moduleId,
          action: "REPORT_EXPORTED",
          entityType: "administrativeExport",
          entityId: reference.id,
          after: record,
          request,
        });
      });
      return {id: reference.id};
    },
  },
});

module.exports = {reportHandlers};
