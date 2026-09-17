const test = require("node:test");
const assert = require("node:assert/strict");
const {assertSafePayload, MAX_PAYLOAD_BYTES} = require("./security");

test("aceita payload administrativo simples", () => {
  const payload = {subject: "Registro", rows: [{quantity: 1}]};
  assert.deepEqual(assertSafePayload(payload), payload);
});

test("rejeita payload administrativo excessivo", () => {
  const payload = {description: "a".repeat(MAX_PAYLOAD_BYTES + 1)};
  assert.throws(() => assertSafePayload(payload));
});

test("rejeita chaves que alterariam o protótipo", () => {
  const payload = JSON.parse("{\"__proto__\":{\"enabled\":true}}");
  assert.throws(() => assertSafePayload(payload));
});
