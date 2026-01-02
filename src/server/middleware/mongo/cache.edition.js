// src/middleware/mongoEditionCache.js
const { getMucajeyDataDb } = require('../../utils/client.mongo');

let db;
let Edition;

async function initEditionCollection() {
  if (!db) {
    db = await getMucajeyDataDb();
    Edition = db.collection('edition');
  }
}

function deepCopy(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function normalizeEdition(doc, edition_id) {
  if (!doc) return null;

  const { _id: omittedId, ...rest } = doc;
  void omittedId;

  const id =
    (typeof rest.edition_id === 'string' && rest.edition_id.trim()) ||
    (typeof rest.edition === 'string' && rest.edition.trim()) ||
    edition_id;

  const name =
    (typeof rest.edition_name === 'string' && rest.edition_name.trim()) ||
    (typeof rest.edition === 'string' && rest.edition.trim()) ||
    id;

  return deepCopy({
    ...rest,
    edition_id: id,
    edition: id, // alias
    edition_name: name,
  });
}

function editionFilter(edition_id) {
  return { $or: [{ edition_id }, { edition: edition_id }] };
}

/* ---- Edition: List ---- */
async function listEditions() {
  await initEditionCollection();

  // project both to be migration-safe
  const editions = await Edition.find(
    {},
    { projection: { edition_id: 1, edition: 1, _id: 0 } }
  ).toArray();

  return editions
    .map(e => e.edition_id || e.edition)
    .filter(Boolean)
    .map(String);
}

/* ---- Edition: Read ---- */
async function readEdition(edition_id) {
  await initEditionCollection();

  const edition = await Edition.findOne(editionFilter(edition_id));
  return normalizeEdition(edition, edition_id);
}

/* ---- Edition: Write / Upsert ---- */
async function writeEdition(edition_id, payload) {
  await initEditionCollection();

  const id = edition_id;
  const editionName =
    (payload && (payload.edition_name || payload.edition)) || id;

  // Ensure invariant fields always present
  const toSet = {
    edition_id: id,
    edition: id, // alias
    edition_name: editionName,
    ...(payload || {}),
  };

  // If someone passes edition/edition_id in payload, enforce canonical
  toSet.edition_id = id;
  toSet.edition = id;

  await Edition.updateOne(
    { edition_id: id },
    { $set: toSet },
    { upsert: true }
  );

  return readEdition(id);
}

/* ---- Edition: Delete ---- */
async function deleteEdition(edition_id) {
  await initEditionCollection();
  await Edition.deleteOne(editionFilter(edition_id));
}

function editionCacheMiddleware(req, _res, next) {
  req.editionsCache = {
    getAll: () => listEditions(),
    get: edition_id => readEdition(edition_id),
    write: (edition_id, payload) => writeEdition(edition_id, payload),
    delete: edition_id => deleteEdition(edition_id),
  };
  next();
}

module.exports = {
  initEditionCollection,
  listEditions,
  readEdition,
  writeEdition,
  deleteEdition,
  editionCacheMiddleware,
};
