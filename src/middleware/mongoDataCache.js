// src/middleware/mongoDataCache.js
const path = require('path');
const { getMucajeyDataDb } = require('../config/mongoClients');

const JSON_EXTENSION = '.json';

let db;
let Edition;
let Card;

async function initCollections() {
  if (!db) {
    db = await getMucajeyDataDb();
    Edition = db.collection('edition');
    Card = db.collection('card');
  }
}

async function initializeDataCache() {
  await initCollections();

  // Optional: kleiner Status-Log, analog zu früher
  const editionCount = await Edition.countDocuments();
  console.log(`[MongoDataCache] Initialisiert – ${editionCount} Edition(en) in MongoDB.`);
}

function deepCopy(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function sanitizeFilename(filename) {
  if (!filename) {
    throw new Error('Dateiname ist erforderlich');
  }
  return path.basename(filename);
}

function getEditionIdentifierFromFilename(filename) {
  const sanitized = sanitizeFilename(filename);
  return path.basename(sanitized, JSON_EXTENSION);
}

/* ---- API 1: Liste der "Dateien" (jetzt Editionen) ---- */
async function listCachedFiles() {
  await initCollections();
  const editions = await Edition.find({}, { projection: { edition: 1 } }).toArray();

  return editions
    .filter(e => !!e.edition)
    .map(e => `${e.edition}${JSON_EXTENSION}`);
}

/* ---- API 2: Read (Edition + Cards zusammensetzen) ---- */
async function readFile(filename) {
  await initCollections();
  const editionId = getEditionIdentifierFromFilename(filename);

  // Edition + Cards parallel holen
  const [editionDoc, cards] = await Promise.all([
    Edition.findOne({ edition: editionId }),
    Card.find({ edition: editionId }).toArray(),
  ]);

  // Wenn es wirklich GAR NICHTS gibt, verhalten wir uns wie früher (null)
  if (!editionDoc && cards.length === 0) {
    return null;
  }

  // Basis-Edition-Name
  const editionName =
    editionDoc?.edition_name || editionDoc?.edition || editionId;

  // Edition-Metadaten aufbauen
  const editionMeta = editionDoc
    ? (() => {
        const { _id, ...rest } = editionDoc;
        return rest;
      })()
    : {
        edition: editionId,
        edition_name: editionName,
      };

  return deepCopy({
    ...editionMeta,
    edition: editionName,
    cards,
  });
}

/* ---- API 3: Write (Edition upsert + Cards ersetzen) ---- */
async function writeFile(filename, payload) {
  await initCollections();

  const editionId = getEditionIdentifierFromFilename(filename);
  const { cards = [], ...rest } = payload ?? {};
  const editionName = payload?.edition || editionId;

  await Edition.updateOne(
    { edition: editionId },
    {
      $set: {
        edition: editionId,
        edition_name: editionName,
        ...rest,
      },
    },
    { upsert: true }
  );

  await Card.deleteMany({ edition: editionId });

  if (Array.isArray(cards) && cards.length > 0) {
    await Card.insertMany(
      cards.map(card => ({
        edition: editionId,
        ...card,
      }))
    );
  }

  return readFile(filename);
}

/* ---- API 4: Delete (Edition + Cards) ---- */
async function deleteFile(filename) {
  await initCollections();
  const editionId = getEditionIdentifierFromFilename(filename);
  await Edition.deleteOne({ edition: editionId });
  await Card.deleteMany({ edition: editionId });
}

/* ---- API 5: Refresh (no-op, Mongo ist live) ---- */
async function refreshDataCache() {
  return;
}

/* ---- API 6: listAllCards (aggregiert wie früher) ---- */
async function listAllCards() {
  await initCollections();

  const [editions, cards] = await Promise.all([
    Edition.find({}).toArray(),
    Card.find({}).toArray(),
  ]);

  const editionMap = new Map(
    editions
      .filter(e => !!e.edition)
      .map(e => [e.edition, e])
  );

  const out = [];

  for (const card of cards) {
    const editionId = card.edition;
    const editionDoc = editionMap.get(editionId);

    const editionName =
      editionDoc?.edition_name || editionDoc?.edition || editionId;

    const editionFile = `${editionId}${JSON_EXTENSION}`;

    const { _id, ...restCard } = card;

    out.push({
      edition_file: editionFile,
      edition_name: editionName,
      edition: editionId,
      ...restCard,
    });
  }

  return deepCopy(out);
}

/* ---- Middleware-Wrapper ---- */
function dataCacheMiddleware(req, res, next) {
  req.dataCache = {
    listFiles: () => listCachedFiles(),
    readFile: filename => readFile(filename),
    writeFile: (filename, data) => writeFile(filename, data),
    deleteFile: filename => deleteFile(filename),
    refresh: () => refreshDataCache(),
    listAllCards: () => listAllCards(),
  };
  next();
}

module.exports = {
  initializeDataCache,
  dataCacheMiddleware,
  listCachedFiles,
  readFile,
  writeFile,
  deleteFile,
  refreshDataCache,
  listAllCards,
};