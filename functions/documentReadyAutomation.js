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
 * Calculates when the citizen's five-day collection window ends.
 * @param {object} data Request data.
 * @return {number}
 */
function getDocumentReadyDeadline(data = {}) {
  const deadline = data.documentoProntoConclusaoPrevistaEm;
  const notifiedAt = data.documentoProntoNotificadoEm;
  const toMillis = (value) => value?.toMillis ? value.toMillis() :
    new Date(value || 0).getTime();
  return toMillis(deadline) ||
    (toMillis(notifiedAt) ? toMillis(notifiedAt) + 5 * 24 * 60 * 60 * 1000 : 0);
}

/**
 * Checks whether the document-ready window has expired.
 * @param {object} data Request data.
 * @param {number} now Current timestamp.
 * @return {boolean}
 */
function isDocumentReadyCompletionDue(data = {}, now = Date.now()) {
  const deadline = getDocumentReadyDeadline(data);
  return data.status === "Documento Pronto" && deadline > 0 && deadline <= now;
}

/**
 * Keeps only fields required to identify completed Balcão requests.
 * @param {object} data Request data.
 * @param {string} documentId Original Firestore document ID.
 * @param {*} completedAt Completion timestamp.
 * @return {object}
 */
function buildBalcaoCompletedSummary(data = {}, documentId = "", completedAt) {
  const requester = data.dadosUsuario || {};
  const beneficiary = data.dadosBeneficiario || {};
  return {
    nome: String(beneficiary.name || requester.name || data.nome || ""),
    cpf: String(beneficiary.cpf || requester.cpf || data.cpf || ""),
    protocolo: String(data.protocolo || documentId),
    concluidoEm: completedAt,
  };
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
  buildBalcaoCompletedSummary,
  becameDocumentReady,
  escapeHtml,
  getDocumentReadyDeadline,
  getReceptionEmail,
  isDocumentReadyCompletionDue,
  isReceptionWalkIn,
};
