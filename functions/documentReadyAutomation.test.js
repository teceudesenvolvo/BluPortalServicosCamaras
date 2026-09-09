const test = require("node:test");
const assert = require("node:assert/strict");
const {
  becameDocumentReady,
  escapeHtml,
  getReceptionEmail,
  isReceptionWalkIn,
} = require("./documentReadyAutomation");

test("detects a document leaving the issuance stage", () => {
  assert.equal(becameDocumentReady(
      {status: "Documento em emissão"},
      {status: "Documento Pronto"},
  ), true);
  assert.equal(becameDocumentReady(
      {status: "Em Análise"},
      {status: "Documento Pronto"},
  ), false);
});

test("accepts only reception walk-ins for email", () => {
  assert.equal(isReceptionWalkIn({
    origem: "recepcao",
    tipoEntradaFila: "Encaixe",
  }), true);
  assert.equal(isReceptionWalkIn({
    origem: "aplicativo",
    tipoEntradaFila: "Encaixe",
  }), false);
  assert.equal(isReceptionWalkIn({origem: "recepcao"}), false);
});

test("finds the reception email before or after account linking", () => {
  assert.equal(getReceptionEmail({
    dadosUsuario: {email: "usuario@exemplo.com"},
    emailVinculoUsuario: "recepcao@exemplo.com",
  }), "usuario@exemplo.com");
  assert.equal(getReceptionEmail({
    emailVinculoUsuario: "recepcao@exemplo.com",
  }), "recepcao@exemplo.com");
});

test("escapes citizen data used in the email HTML", () => {
  assert.equal(escapeHtml("<Ana & José>"), "&lt;Ana &amp; José&gt;");
});

