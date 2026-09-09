const DOCUMENT_ISSUANCE_STATUSES = new Set([
  "Documento em emissão",
  "Documento em preparação",
  "Documento sendo preparado",
]);

/**
 * Checks whether a request has just finished the document issuance stage.
 * @param {object} beforeData Previous Firestore data.
 * @param {object} afterData Current Firestore data.
 * @return {boolean}
 */
function becameDocumentReady(beforeData = {}, afterData = {}) {
  return DOCUMENT_ISSUANCE_STATUSES.has(beforeData.status) &&
    afterData.status === "Documento Pronto";
}

/**
 * Checks whether a request was registered as a reception walk-in.
 * @param {object} data Firestore request data.
 * @return {boolean}
 */
function isReceptionWalkIn(data = {}) {
  return data.origem === "recepcao" && (
    data.tipoEntradaFila === "Encaixe" ||
    data.semAgendamento === true ||
    data.dadosSolicitacao?.detalhes?.origem === "Recepção"
  );
}

/**
 * Finds the citizen email saved before or after account linking.
 * @param {object} data Firestore request data.
 * @return {string}
 */
function getReceptionEmail(data = {}) {
  return String(
      data.dadosUsuario?.email ||
      data.emailVinculoUsuario ||
      data.userEmail ||
      "",
  ).trim();
}

/**
 * Escapes user-provided values before inserting them into email HTML.
 * @param {unknown} value Value to escape.
 * @return {string}
 */
function escapeHtml(value) {
  return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
}

module.exports = {
  becameDocumentReady,
  escapeHtml,
  getReceptionEmail,
  isReceptionWalkIn,
};
