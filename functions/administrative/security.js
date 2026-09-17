const {HttpsError} = require("firebase-functions/v2/https");

const MAX_PAYLOAD_BYTES = 128 * 1024;
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const assertSafeValue = (value, path = "payload") => {
  const primitive = ["string", "number", "boolean"].includes(typeof value);
  if (value === null || primitive) {
    return;
  }
  const oversizedArray = Array.isArray(value) && value.length > 500;
  if (typeof value !== "object" || oversizedArray) {
    throw new HttpsError(
        "invalid-argument", `${path} possui um formato inválido.`);
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSafeValue(item, `${path}[${index}]`));
    return;
  }
  Object.entries(value).forEach(([key, item]) => {
    if (FORBIDDEN_KEYS.has(key)) {
      throw new HttpsError("invalid-argument", "Campo não permitido.");
    }
    assertSafeValue(item, `${path}.${key}`);
  });
};

const assertSafePayload = (payload) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpsError("invalid-argument", "Dados da operação inválidos.");
  }
  let serialized = "";
  try {
    serialized = JSON.stringify(payload);
  } catch (error) {
    throw new HttpsError("invalid-argument", "Dados da operação inválidos.");
  }
  if (serialized.length > MAX_PAYLOAD_BYTES) {
    throw new HttpsError(
        "resource-exhausted", "A operação excede o tamanho permitido.");
  }
  assertSafeValue(payload);
  return payload;
};

module.exports = {MAX_PAYLOAD_BYTES, assertSafePayload};
