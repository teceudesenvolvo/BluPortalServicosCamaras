/* eslint-disable max-len */
const test = require("node:test");
const assert = require("node:assert/strict");
const {evaluatePermission, permissionParts} = require("./authorization");
const {counterKey} = require("./counters");

test("administrador possui permissão administrativa por padrão", () => {
  const settings = {modules: {contratos: {admin: true}}};
  assert.equal(evaluatePermission({settings, role: "Admin", permission: "contratos.configurar"}), true);
});

test("módulo desativado bloqueia inclusive o administrador", () => {
  const settings = {modules: {contratos: {admin: false}}};
  assert.equal(evaluatePermission({settings, role: "Admin", permission: "contratos.visualizar"}), false);
});

test("permissão configurada prevalece sobre o padrão do papel", () => {
  const settings = {modules: {contratos: {admin: true}}, security: {actionPermissions: {"Fiscal de Contrato": {"contratos.fiscalizar": false}}}};
  assert.equal(evaluatePermission({settings, role: "Fiscal de Contrato", permission: "contratos.fiscalizar"}), false);
});

test("não aceita permissão ou prefixo desconhecido", () => {
  assert.throws(() => permissionParts("outro.editar"));
  assert.throws(() => counterKey("XXX", 2026));
});
