/* eslint-disable max-len */
const {HttpsError} = require("firebase-functions/v2/https");

const MODULE_ACTIONS = {
  contratos: ["visualizar", "criar", "editar", "fiscalizar", "atestar", "gerenciar", "configurar"],
  almoxarifado: ["visualizar", "solicitar", "movimentar", "autorizar", "gerenciar", "configurar"],
  patrimonio: ["visualizar", "criar", "movimentar", "inventariar", "baixar", "gerenciar", "configurar"],
  manutencao: ["visualizar", "solicitar", "executar", "validar", "gerenciar", "configurar"],
  frotas: ["visualizar", "registrar", "movimentar", "gerenciar", "configurar"],
};

const DEFAULT_ROLES = {
  contratos: ["Fiscal de Contrato", "Gestor de Contrato", "Gestor de Setor"],
  almoxarifado: ["Almoxarifado", "Gestor de Setor"],
  patrimonio: ["Patrimônio", "Gestor de Setor"],
  manutencao: ["Manutenção", "Gestor de Setor"],
  frotas: ["Frotas", "Gestor de Setor"],
};

const permissionParts = (permission) => {
  const [moduleId, action] = String(permission || "").split(".");
  if (!MODULE_ACTIONS[moduleId]?.includes(action)) {
    throw new HttpsError("invalid-argument", "Permissão administrativa inválida.");
  }
  return {moduleId, action};
};

const evaluatePermission = ({settings = {}, role = "", email = "", permission}) => {
  const {moduleId, action} = permissionParts(permission);
  if (settings.modules?.[moduleId]?.admin !== true) return false;
  const roots = settings.security?.rootEmails || [];
  if (roots.map((item) => String(item).toLowerCase()).includes(String(email).toLowerCase())) return true;
  const configured = settings.security?.actionPermissions?.[role]?.[permission];
  if (typeof configured === "boolean") return configured;
  if (["Admin", "Administrador"].includes(role)) return true;
  if (action === "configurar") return false;
  return DEFAULT_ROLES[moduleId]?.includes(role) || false;
};

const getActorContext = async (db, auth) => {
  if (!auth) throw new HttpsError("unauthenticated", "Autenticação necessária.");
  const [profile, control] = await Promise.all([
    db.collection("users").doc(auth.uid).get(),
    db.collection("system-control").doc("portal").get(),
  ]);
  const user = profile.data() || {};
  return {
    actor: {
      userId: auth.uid,
      name: user.name || user.nome || auth.token?.name || auth.token?.email || "Usuário",
      email: user.email || auth.token?.email || "",
      role: user.tipo || "Cidadão",
      departmentId: user.departmentId || user.setorId || "",
    },
    settings: control.data() || {},
  };
};

const assertPermission = ({settings, actor}, permission) => {
  if (!evaluatePermission({settings, role: actor.role, email: actor.email, permission})) {
    throw new HttpsError("permission-denied", "Seu perfil não possui permissão para realizar esta operação.");
  }
};

module.exports = {MODULE_ACTIONS, DEFAULT_ROLES, permissionParts, evaluatePermission, getActorContext, assertPermission};
