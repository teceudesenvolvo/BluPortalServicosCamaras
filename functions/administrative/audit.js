/* eslint-disable max-len */
const buildAuditEntry = ({actor, moduleId, action, entityType, entityId, before = null, after = null, origin = "web", request}) => ({
  moduleId,
  action,
  entityType,
  entityId,
  actorId: actor.userId,
  actorName: actor.name,
  actorRole: actor.role,
  actorDepartmentId: actor.departmentId || "",
  before,
  after,
  origin,
  ip: String(request?.rawRequest?.headers?.["x-forwarded-for"] || request?.rawRequest?.ip || "").split(",")[0].trim(),
  userAgent: String(request?.rawRequest?.headers?.["user-agent"] || "").slice(0, 500),
});

const addAuditToTransaction = ({db, transaction, timestamp, ...data}) => {
  const auditRef = db.collection("administrativeAuditLogs").doc();
  transaction.create(auditRef, {...buildAuditEntry(data), createdAt: timestamp});
  return auditRef;
};

module.exports = {buildAuditEntry, addAuditToTransaction};
