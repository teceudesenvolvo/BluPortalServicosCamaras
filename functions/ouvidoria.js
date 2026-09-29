const {onCall, HttpsError} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

const protocolPattern = /^OUV-\d{4}-([A-Za-z0-9]{20})$/;

const toIsoString = (value) => {
  if (!value) return null;
  if (typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

exports.publicOuvidoriaLookup = onCall(
    {cors: true, maxInstances: 10},
    async (request) => {
      const protocol = String(request.data?.protocol || "").trim();
      const match = protocol.match(protocolPattern);
      if (!match) {
        throw new HttpsError(
            "invalid-argument", "Informe um número de protocolo válido.");
      }

      const document = await admin.firestore()
          .collection("ouvidoria").doc(match[1]).get();
      const data = document.data() || {};
      if (!document.exists || data.protocolo !== protocol ||
          data.userId !== "anonimo") {
        throw new HttpsError("not-found", "Protocolo não encontrado.");
      }

      return {
        protocolo: data.protocolo,
        status: String(data.status || "Recebida"),
        etapaAtual: String(data.etapaAtual || data.status || "Recebida"),
        dataManifestacao: toIsoString(data.dataManifestacao),
        ultimaAtualizacao: toIsoString(data.ultimaAtualizacao),
      };
    },
);
