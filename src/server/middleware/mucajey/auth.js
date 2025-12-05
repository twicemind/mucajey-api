const nodeCrypto = require('crypto');
const { getMucajeyDb } = require('../../utils/client.mongo');
const { writeUsers } = require('../mongo/cache.user');
const { writeServices: writeApiKeys } = require('../mongo/cache.service');
const { MASTER_API_KEY } = require('../../config');

// API Keys Store (wird im Speicher gehalten, Datenquelle ist MongoDB)
const apiKeysStore = {
  keys: [],
  loaded: false,
};

// Generiere sicheren API-Key
function generateSecureApiKey() {
  return nodeCrypto.randomBytes(32).toString('hex');
}

// API Keys aus der Mongo-DB laden und im Cache speichern
async function loadApiKeys() {
  const db = await getMucajeyDb();
  const collection = db.collection('service');
  const keys = await collection.find({}).toArray();
  apiKeysStore.keys = keys;
  apiKeysStore.loaded = true;
  return keys;
}

// Interne Helper-Funktion, um sicherzustellen, dass der Cache geladen ist
async function ensureApiKeysLoaded() {
  if (!apiKeysStore.loaded) {
    await loadApiKeys();
  }
}

// API Keys aus dem Cache in die DB schreiben (vollständiger Sync)
async function saveApiKeys() {
  const db = await getMucajeyDb();
  const collection = db.collection('service');

  for (const key of apiKeysStore.keys) {
    await collection.updateOne(
      { key: key.key },
      { $set: key },
      { upsert: true }
    );
  }
}

// Prüfe ob API-Key gültig ist (inkl. MASTER_API_KEY)
async function isValidApiKey(apiKey) {
  if (apiKey === MASTER_API_KEY) {
    return true;
  }

  await ensureApiKeysLoaded();

  const keyEntry = apiKeysStore.keys.find(k => k.key === apiKey);
  return !!(keyEntry && keyEntry.active !== false);
}

// API Key Authentication Middleware (verwendet MongoDB + Cache)
async function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({
      error: 'API-Key erforderlich',
      message: 'Bitte fügen Sie den X-API-Key Header hinzu',
    });
  }

  try {
    const valid = await isValidApiKey(apiKey);

    if (!valid) {
      return res.status(403).json({
        error: 'Ungültiger API-Key',
        message: 'Der bereitgestellte API-Key ist ungültig oder inaktiv',
      });
    }

    return next();
  } catch (err) {
    return next(err);
  }
}

// Hilfsfunktionen, um API-Keys zu verwalten (DB + Cache)
async function addApiKey(keyDoc) {
  const db = await getMucajeyDb();
  const collection = db.collection('service');

  await collection.updateOne(
    { key: keyDoc.key },
    { $set: keyDoc },
    { upsert: true }
  );

  await ensureApiKeysLoaded();
  const idx = apiKeysStore.keys.findIndex(k => k.key === keyDoc.key);
  if (idx >= 0) {
    apiKeysStore.keys[idx] = { ...apiKeysStore.keys[idx], ...keyDoc };
  } else {
    apiKeysStore.keys.push(keyDoc);
  }
}

async function updateApiKey(key, updates) {
  const db = await getMucajeyDb();
  const collection = db.collection('service');

  await collection.updateOne({ key }, { $set: updates });

  await ensureApiKeysLoaded();
  const idx = apiKeysStore.keys.findIndex(k => k.key === key);
  if (idx >= 0) {
    apiKeysStore.keys[idx] = { ...apiKeysStore.keys[idx], ...updates };
  }
}

async function deleteApiKey(key) {
  const db = await getMucajeyDb();
  const collection = db.collection('service');

  await collection.deleteOne({ key });

  await ensureApiKeysLoaded();
  apiKeysStore.keys = apiKeysStore.keys.filter(k => k.key !== key);
}

module.exports = {
  apiKeysStore,
  loadApiKeys,
  saveApiKeys,
  generateSecureApiKey,
  isValidApiKey,
  authenticateApiKey,
  writeUsers,
  writeApiKeys,
  addApiKey,
  updateApiKey,
  deleteApiKey,
};
