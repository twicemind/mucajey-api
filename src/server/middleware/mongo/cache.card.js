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
  if (!doc) {
    return doc;
  }

  const { _id: omittedId, ...rest } = doc;
  void omittedId; // omit MongoDB internal id
  return deepCopy(rest);
}

/* ---- Cards: Liste ---- */
async function listCards() {
  await initCardCollection();
  const cards = await Card.find({}, { projection: { _id: 0 } }).toArray();
  return deepCopy(cards);
}

/* ---- Cards: Read nach Edition ---- */
async function readCardsByEdition(editionId) {
  await initCardCollection();
  const cards = await Card.find(
    { edition: editionId },
    { projection: { _id: 0 } }
  ).toArray();
  return deepCopy(cards);
}

/* ---- Cards: Write ---- */
async function writeCardsForEdition(editionId, cards) {
  await initCardCollection();

  await Card.deleteMany({ edition: editionId });

  if (Array.isArray(cards) && cards.length > 0) {
    await Card.insertMany(
      cards.map(card => ({
        edition: editionId,
        ...card,
      }))
    );
  }

  return readCardsByEdition(editionId);
}

async function writeCardForEdition(editionId, card) {
  await initCardCollection();
  const payload = {
    edition: editionId,
    ...card,
  };
  await Card.insertOne(payload);
  return normalizeCard(payload);
}

async function deleteCardByEdition(editionId, cardId) {
  await initCardCollection();
  await Card.deleteOne({ edition: editionId, id: cardId });
}

async function deleteCardsForEdition(editionId) {
  await initCardCollection();
  await Card.deleteMany({ edition: editionId });
}

async function updateCardByEdition(editionId, cardId, updatedFields) {
  await initCardCollection();
  await Card.updateOne(
    { edition: editionId, id: cardId },
    { $set: updatedFields }
  );

  const updated = await Card.findOne(
    { edition: editionId, id: cardId },
    { projection: { _id: 0 } }
  );

  return normalizeCard(updated);
}

function cardCacheMiddleware(req, res, next) {
  req.cardsCache = {
    getAll: () => listCards(),
    getByEdition: editionId => readCardsByEdition(editionId),
    writeMany: (editionId, cards) => writeCardsForEdition(editionId, cards),
    deleteMany: editionId => deleteCardsForEdition(editionId),
    write: (editionId, card) => writeCardForEdition(editionId, card),
    delete: (editionId, cardId) => deleteCardByEdition(editionId, cardId),
    update: (editionId, cardId, updatedFields) =>
      updateCardByEdition(editionId, cardId, updatedFields),
  };
  next();
}

module.exports = {
  listCards,
  readCardsByEdition,
  writeCardsForEdition,
  deleteCardsForEdition,
  cardCacheMiddleware,
  writeCardForEdition,
  deleteCardByEdition,
  updateCardByEdition,
  initCardCollection,
};
