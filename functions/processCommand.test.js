const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const setup = () => {
  const records = new Map([
    ["users/citizen", {nome: "Interessado", tipo: "Cidadão"}],
    ["processTypes/service", {name: "Requerimento", active: true}],
  ]);
  const reference = (path) => ({
    id: path.split("/").pop(),
    path,
    get: async () => ({
      exists: records.has(path), data: () => records.get(path),
    }),
    collection: (name) => collection(`${path}/${name}`),
  });
  const collection = (path) => ({
    doc: (id = "generated") => reference(`${path}/${id}`),
  });
  const writes = () => ({
    get: (ref) => ref.get(),
    set: (ref, value) => records.set(ref.path, value),
    commit: async () => {},
  });
  const db = {collection, batch: writes,
    runTransaction: (callback) => callback(writes())};
  const firestore = () => db;
  firestore.FieldValue = {serverTimestamp: () => new Date()};
  const {HttpsError} = require("firebase-functions/v2/https");
  const source = fs.readFileSync(`${__dirname}/index.js`, "utf8");
  const sandbox = {exports: {}, admin: {firestore}, HttpsError,
    console: {error: () => {}}, onCall: (options, handler) => handler};
  const invoke = "\nexports.invoke = json => " +
    "exports.processCommand(JSON.parse(json));";
  vm.runInNewContext(source.slice(source.indexOf("const protocolRuntime")) +
      invoke, sandbox);
  return {records, call: (request) =>
    sandbox.exports.invoke(JSON.stringify(request))};
};

test("creation preserves scalars and null deadline/metadata", async () => {
  const {call, records} = setup();
  const result = await call({auth: {uid: "citizen", token: {}}, data: {
    action: "create", typeId: "service", subject: "Solicitação",
    metadata: {optional: null, count: 2, accepted: true, omitted: undefined},
  }});
  const process = records.get(`processes/${result.id}`);
  assert.equal(process.deadlineAt, null);
  assert.equal(process.subject, "Solicitação");
  assert.equal(process.sequence, 1);
  assert.equal(process.metadata.optional, null);
  assert.equal(process.metadata.count, 2);
  assert.equal(process.metadata.accepted, true);
  assert.equal(Object.hasOwn(process.metadata, "omitted"), false);
  assert.match(result.protocolNumber, /^\d{4}\.000001$/);
  assert.equal(records.size, 7);
});

test("HTTP invocation requires Firebase authentication", async () => {
  const {call, records} = setup();
  await assert.rejects(call({data: {action: "create"}}),
      (error) => error.code === "unauthenticated");
  assert.equal(records.size, 2);
});
