const cache = new Map(); // key: edition_id, value: edition document
let aggregatedCards = [];

/**
 * Deep copy for safe external reads.
 */
function deepCopy(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function requireString(value, msg) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(msg);
  }
  return value.trim();
}

/**
 * Normalize an edition document.
 * Ensures edition_id exists, cards is array, and edition_name fallback.
 */
function normalizeEdition(input) {
  const doc = input && typeof input === 'object' ? input : {};
  const edition_id = requireString(
    doc.edition_id || doc.edition,
    'edition_id ist erforderlich'
  );

  const cards = Array.isArray(doc.cards) ? doc.cards : [];
  const edition_name =
    typeof doc.edition_name === 'string' ? doc.edition_name : '';

  return {
    ...doc,
    edition_id,
    // keep `edition` as optional alias for legacy consumers (edition == edition_id)
    edition: edition_id,
    edition_name: edition_name || edition_id,
    cards,
  };
}

/**
 * Canonicalize cards for aggregated list:
 * - enforce edition_id
 * - set edition alias = edition_id
 */
function normalizeCard(card, edition_id, edition_name) {
  const c = card && typeof card === 'object' ? card : {};
  return {
    ...c,
    edition_id,
    edition: edition_id,
    edition_name,
  };
}

function rebuildAggregatedCards() {
  const combined = [];

  for (const editionDoc of cache.values()) {
    const { edition_id, edition_name, cards } = editionDoc;

    for (const card of cards) {
      combined.push(normalizeCard(card, edition_id, edition_name));
    }
  }

  aggregatedCards = combined;
}

/**
 * Public API
 */

function listEditions() {
  return Array.from(cache.keys());
}

function getEdition(edition_id) {
  const id = requireString(edition_id, 'edition_id ist erforderlich');
  const doc = cache.get(id);
  return doc ? deepCopy(doc) : null;
}

function listAllCards() {
  return deepCopy(aggregatedCards);
}

function listCardsByEdition(edition_id) {
  const id = requireString(edition_id, 'edition_id ist erforderlich');
  return deepCopy(aggregatedCards.filter(c => c.edition_id === id));
}

async function upsertEdition(edition_id, payload) {
  const id = requireString(edition_id, 'edition_id ist erforderlich');
  const normalized = normalizeEdition({ ...(payload || {}), edition_id: id });
  cache.set(id, normalized);
  rebuildAggregatedCards();
  return deepCopy(normalized);
}

async function deleteEdition(edition_id) {
  const id = requireString(edition_id, 'edition_id ist erforderlich');
  cache.delete(id);
  rebuildAggregatedCards();
}

async function replaceCardsForEdition(edition_id, cards) {
  const id = requireString(edition_id, 'edition_id ist erforderlich');
  const editionDoc = cache.get(id);

  if (!editionDoc) {
    // Option: create edition implicitly; adjust if you prefer to throw
    cache.set(
      id,
      normalizeEdition({ edition_id: id, edition_name: id, cards: [] })
    );
  }

  const doc = cache.get(id);
  doc.cards = Array.isArray(cards) ? deepCopy(cards) : [];
  cache.set(id, doc);

  rebuildAggregatedCards();
  return listCardsByEdition(id);
}

async function addCardToEdition(edition_id, card) {
  const id = requireString(edition_id, 'edition_id ist erforderlich');
  const editionDoc =
    cache.get(id) ||
    normalizeEdition({ edition_id: id, edition_name: id, cards: [] });

  editionDoc.cards = Array.isArray(editionDoc.cards) ? editionDoc.cards : [];
  editionDoc.cards.push(deepCopy(card || {}));
  cache.set(id, editionDoc);

  rebuildAggregatedCards();
  return true;
}

async function updateCardInEdition(edition_id, cardId, patch) {
  const id = requireString(edition_id, 'edition_id ist erforderlich');
  const cid = requireString(cardId, 'card id ist erforderlich');

  const editionDoc = cache.get(id);
  if (!editionDoc || !Array.isArray(editionDoc.cards)) return null;

  const idx = editionDoc.cards.findIndex(c => String(c.id) === cid);
  if (idx < 0) return null;

  editionDoc.cards[idx] = { ...editionDoc.cards[idx], ...(patch || {}) };
  cache.set(id, editionDoc);

  rebuildAggregatedCards();
  return deepCopy(editionDoc.cards[idx]);
}

async function deleteCardFromEdition(edition_id, cardId) {
  const id = requireString(edition_id, 'edition_id ist erforderlich');
  const cid = requireString(cardId, 'card id ist erforderlich');

  const editionDoc = cache.get(id);
  if (!editionDoc || !Array.isArray(editionDoc.cards)) return;

  editionDoc.cards = editionDoc.cards.filter(c => String(c.id) !== cid);
  cache.set(id, editionDoc);

  rebuildAggregatedCards();
}

/**
 * Express middleware
 */
function dataCacheMiddleware(req, _res, next) {
  req.dataCache = {
    // editions
    listEditions: () => listEditions(),
    getEdition: edition_id => getEdition(edition_id),
    upsertEdition: (edition_id, data) => upsertEdition(edition_id, data),
    deleteEdition: edition_id => deleteEdition(edition_id),

    // cards
    listAllCards: () => listAllCards(),
    listCardsByEdition: edition_id => listCardsByEdition(edition_id),
    replaceCardsForEdition: (edition_id, cards) =>
      replaceCardsForEdition(edition_id, cards),
    addCardToEdition: (edition_id, card) => addCardToEdition(edition_id, card),
    updateCardInEdition: (edition_id, cardId, patch) =>
      updateCardInEdition(edition_id, cardId, patch),
    deleteCardFromEdition: (edition_id, cardId) =>
      deleteCardFromEdition(edition_id, cardId),
  };

  next();
}

module.exports = {
  // middleware
  dataCacheMiddleware,

  // direct helpers (useful for tests)
  listEditions,
  getEdition,
  upsertEdition,
  deleteEdition,
  replaceCardsForEdition,
  addCardToEdition,
  updateCardInEdition,
  deleteCardFromEdition,
  listAllCards,
  listCardsByEdition,
};
