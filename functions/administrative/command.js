/* eslint-disable max-len */
const {HttpsError} = require("firebase-functions/v2/https");
const {getActorContext, assertPermission} = require("./authorization");
const {assertSafePayload} = require("./security");

const createCommandRunner = ({db, handlers}) => async (request) => {
  const moduleId = String(request.data?.moduleId || "");
  const action = String(request.data?.action || "");
  const handler = handlers[moduleId]?.[action];
  if (!handler) throw new HttpsError("invalid-argument", "Operação administrativa inválida.");
  const context = await getActorContext(db, request.auth);
  assertPermission(context, handler.permission);
  const payload = assertSafePayload(request.data?.payload || {});
  return handler.execute({db, request, actor: context.actor, settings: context.settings, payload});
};

module.exports = {createCommandRunner};
