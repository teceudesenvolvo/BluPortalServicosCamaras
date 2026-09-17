/* eslint-disable max-len */
const PREFIXES = ["CTR", "FIS", "OCO", "REQ", "OS", "MAN", "INV", "PAT"];

const counterKey = (prefix, year) => {
  const normalized = String(prefix || "").toUpperCase();
  if (!PREFIXES.includes(normalized)) throw new Error("Prefixo administrativo inválido.");
  return `${normalized}-${year}`;
};

const nextIdentifierInTransaction = async ({db, transaction, prefix, year, timestamp, digits = 4}) => {
  const key = counterKey(prefix, year);
  const reference = db.collection("administrativeCounters").doc(key);
  const snapshot = await transaction.get(reference);
  const sequence = Number(snapshot.data()?.sequence || 0) + 1;
  transaction.set(reference, {prefix, year, sequence, updatedAt: timestamp}, {merge: true});
  return {sequence, identifier: `${prefix}-${year}-${String(sequence).padStart(digits, "0")}`};
};

module.exports = {PREFIXES, counterKey, nextIdentifierInTransaction};
