const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildBalcaoCompletedSummary,
  becameDocumentReady,
  escapeHtml,
  getDocumentReadyDeadline,
  getReceptionEmail,
  isReceptionWalkIn,
  isDocumentReadyCompletionDue,
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

test(
    "automatically concludes a ready document after its five-day deadline",
    () => {
      const notifiedAt = new Date("2026-09-20T12:00:00Z");
      const expectedDeadline = notifiedAt.getTime() + 5 * 24 * 60 * 60 * 1000;
      const request = {
        status: "Documento Pronto",
        documentoProntoNotificadoEm: notifiedAt,
      };

      assert.equal(getDocumentReadyDeadline(request), expectedDeadline);
      assert.equal(
          isDocumentReadyCompletionDue(request, expectedDeadline - 1), false,
      );
      assert.equal(
          isDocumentReadyCompletionDue(request, expectedDeadline), true,
      );
      assert.equal(isDocumentReadyCompletionDue({
        ...request,
        status: "Em análise",
      }, expectedDeadline), false);
    },
);

test("completed Balcão archive contains only the report summary fields", () => {
  const summary = buildBalcaoCompletedSummary({
    dadosUsuario: {name: "Solicitante", cpf: "111"},
    dadosBeneficiario: {name: "Beneficiário", cpf: "222"},
    protocolo: "BAL-2026-001",
    descricao: "Informação que não deve ser retida",
  }, "document-id", "server timestamp");

  assert.deepEqual(summary, {
    nome: "Beneficiário",
    cpf: "222",
    protocolo: "BAL-2026-001",
    concluidoEm: "server timestamp",
  });
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
