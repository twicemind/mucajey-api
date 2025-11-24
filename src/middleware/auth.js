const fs = require('fs').promises;
const crypto = require('crypto');
const { API_KEYS_DIR, API_KEYS_FILE, MASTER_API_KEY } = require('../config');

// API Keys Store (wird beim Start geladen)
let apiKeysStore = {
  keys: []
};

// API Keys Datei laden
async function loadApiKeys() {
  try {
    await fs.mkdir(API_KEYS_DIR, { recursive: true });
    const data = await fs.readFile(API_KEYS_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    apiKeysStore.keys = Array.isArray(parsed.keys) ? parsed.keys : [];
  } catch (error) {
    apiKeysStore.keys = [];
    await saveApiKeys();
  }
}

// API Keys Datei speichern
async function saveApiKeys() {
  await fs.writeFile(API_KEYS_FILE, JSON.stringify({ keys: apiKeysStore.keys }, null, 2), 'utf-8');
}

// Generiere sicheren API-Key
function generateSecureApiKey() {
  return crypto.randomBytes(32).toString('hex');
}

// Prüfe ob API-Key gültig ist
function isValidApiKey(apiKey) {
  if (apiKey === MASTER_API_KEY) {
    return true;
  }
  const keyEntry = apiKeysStore.keys.find(k => k.key === apiKey);
  return keyEntry && keyEntry.active;
}

// API Key Authentication Middleware
function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({ 
      error: 'API-Key erforderlich',
      message: 'Bitte fügen Sie den X-API-Key Header hinzu'
    });
  }
  
  if (!isValidApiKey(apiKey)) {
    return res.status(403).json({ 
      error: 'Ungültiger API-Key',
      message: 'Der bereitgestellte API-Key ist ungültig'
    });
  }
  
  next();
}

module.exports = {
  apiKeysStore,
  loadApiKeys,
  saveApiKeys,
  generateSecureApiKey,
  isValidApiKey,
  authenticateApiKey
};
