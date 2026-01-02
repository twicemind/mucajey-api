// src/middleware/mongoCardCache.js
const { getMucajeyDataDb } = require('../../utils/client.mongo');

let db;
let Card;

async function initCardCollection() {
  if (!db) {
    db = await getMucajeyDataDb();
    Card = db.collection('card');
  }
}

function deepCopy(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function normalizeCard(doc) {
  if (!doc) return doc;
  const { _id: omittedId, ...rest } = doc;
  void omittedId;
  return deepCopy(rest);
}

// Canonical: edition_id
function editionFilter(edition_id) {
  return {
    $or: [{ edition_id }, { edition: edition_id }],
  };
}

function ensureEditionFields(edition_id, doc) {
  return {
    edition_id,
    edition: edition_id, // alias for compatibility
    ...(doc || {}),
  };
}

/* ---- Cards: List ---- */
async function listCards() {
  await initCardCollection();
  const cards = await Card.find({}, { projection: { _id: 0 } }).toArray();
  return deepCopy(cards);
}

/* ---- Cards: Read by Edition ---- */
async function readCardsByEdition(edition_id) {
  await initCardCollection();
  const cards = await Card.find(editionFilter(edition_id), {
    projection: { _id: 0 },
  }).toArray();
  return deepCopy(cards);
}

/* ---- Cards: Replace edition set ---- */
async function writeCardsForEdition(edition_id, cards) {
  await initCardCollection();

  // delete both legacy and new variants
  await Card.deleteMany(editionFilter(edition_id));

  if (Array.isArray(cards) && cards.length > 0) {
    await Card.insertMany(
      cards.map(card => ensureEditionFields(edition_id, card))
    );
  }

  return readCardsByEdition(edition_id);
}

async function writeCardForEdition(edition_id, card) {
  await initCardCollection();
  const payload = ensureEditionFields(edition_id, card);
  await Card.insertOne(payload);
  return normalizeCard(payload);
}

async function deleteCardByEdition(edition_id, cardId) {
  await initCardCollection();
  await Card.deleteOne({ ...editionFilter(edition_id), id: cardId });
}

async function deleteCardsForEdition(edition_id) {
  await initCardCollection();
  await Card.deleteMany(editionFilter(edition_id));
}

async function updateCardByEdition(edition_id, cardId, updatedFields) {
  await initCardCollection();

  // do not allow edition fields to be “patched away”
  const { edition: _e, edition_id: _eid, ...safeSet } = updatedFields || {};
  void _e;
  void _eid;

  await Card.updateOne(
    { ...editionFilter(edition_id), id: cardId },
    { $set: safeSet }
  );

  const updated = await Card.findOne(
    { ...editionFilter(edition_id), id: cardId },
    { projection: { _id: 0 } }
  );

  // keep invariant even if legacy doc matched
  if (updated) {
    updated.edition_id = edition_id;
    updated.edition = edition_id;
  }

  return normalizeCard(updated);
}

function cardCacheMiddleware(req, _res, next) {
  req.cardsCache = {
    getAll: () => listCards(),
    getByEdition: edition_id => readCardsByEdition(edition_id),
    writeMany: (edition_id, cards) => writeCardsForEdition(edition_id, cards),
    deleteMany: edition_id => deleteCardsForEdition(edition_id),
    write: (edition_id, card) => writeCardForEdition(edition_id, card),
    delete: (edition_id, cardId) => deleteCardByEdition(edition_id, cardId),
    update: (edition_id, cardId, updatedFields) =>
      updateCardByEdition(edition_id, cardId, updatedFields),
  };
  next();
}

module.exports = {
  initCardCollection,
  listCards,
  readCardsByEdition,
  writeCardsForEdition,
  writeCardForEdition,
  deleteCardByEdition,
  deleteCardsForEdition,
  updateCardByEdition,
  cardCacheMiddleware,
};
