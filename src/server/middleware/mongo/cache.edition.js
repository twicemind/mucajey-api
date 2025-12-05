// src/middleware/mongoEditionCache.js
const path = require('path');
const { getMucajeyDataDb } = require('../../utils/client.mongo');

const JSON_EXTENSION = '.json';

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

function sanitizeFilename(filename) {
  if (!filename) throw new Error('Dateiname ist erforderlich');
  return path.basename(filename);
}

function getEditionIdentifierFromFilename(filename) {
  const sanitized = sanitizeFilename(filename);
  return path.basename(sanitized, JSON_EXTENSION);
}

/* ---- Edition: Liste ---- */
async function listEditions() {
  await initEditionCollection();
  const editions = await Edition.find(
    {},
    { projection: { edition: 1, _id: 0 } }
  ).toArray();
  return editions
    .filter(e => !!e.edition)
    .map(e => `${e.edition}${JSON_EXTENSION}`);
}

/* ---- Edition: Read ---- */
async function readEdition(filename) {
  await initEditionCollection();
  const editionId = getEditionIdentifierFromFilename(filename);

  const editionDoc = await Edition.findOne({ edition: editionId });

  if (!editionDoc) return null;

  const { _id: omittedId, ...rest } = editionDoc;
  void omittedId; // omit MongoDB internal id

  return deepCopy({
    ...rest,
    edition: rest.edition_name || rest.edition || editionId,
  });
}

/* ---- Edition: Write ---- */
async function writeEdition(filename, payload) {
  await initEditionCollection();

  const editionId = getEditionIdentifierFromFilename(filename);
  const editionName = payload?.edition || editionId;

  await Edition.updateOne(
    { edition: editionId },
    {
      $set: {
        edition: editionId,
        edition_name: editionName,
        ...payload,
      },
    },
    { upsert: true }
  );

  return readEdition(filename);
}

/* ---- Edition: Delete ---- */
async function deleteEdition(filename) {
  await initEditionCollection();
  const editionId = getEditionIdentifierFromFilename(filename);
  await Edition.deleteOne({ edition: editionId });
}

function editionCacheMiddleware(req, res, next) {
  req.editionsCache = {
    getAll: () => listEditions(),
    get: editionId => readEdition(editionId),
    write: (filename, payload) => writeEdition(filename, payload),
    delete: filename => deleteEdition(filename),
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
