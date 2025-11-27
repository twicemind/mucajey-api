const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { DATA_DIR } = require('../config');

const cache = new Map();
let aggregatedCards = [];
let watcher;
let reloadTimer;

const JSON_EXTENSION = '.json';
const RELOAD_DELAY_MS = 250;

function deepCopy(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function sanitizeFilename(filename) {
  if (!filename) {
    throw new Error('Dateiname ist erforderlich');
  }
  return path.basename(filename);
}

async function ensureDataDirectory() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
}

async function loadJsonFileIntoCache(filename) {
  const sanitized = sanitizeFilename(filename);
  if (!sanitized.toLowerCase().endsWith(JSON_EXTENSION)) {
    return;
  }

  const filePath = path.join(DATA_DIR, sanitized);
  const content = await fsp.readFile(filePath, 'utf-8');
  const parsed = JSON.parse(content);
  cache.set(sanitized, parsed);
  rebuildAggregatedCards();
  return parsed;
}

async function scanDataDirectory() {
  await ensureDataDirectory();
  const entries = await fsp.readdir(DATA_DIR);
  const jsonFiles = entries.filter(file => file.toLowerCase().endsWith(JSON_EXTENSION));
  const seenFiles = new Set();

  for (const file of jsonFiles) {
    seenFiles.add(file);
    try {
      await loadJsonFileIntoCache(file);
    } catch (error) {
      console.error(`Fehler beim Parsen von '${file}':`, error.message);
      cache.delete(file);
      rebuildAggregatedCards();
    }
  }

  for (const cachedFile of [...cache.keys()]) {
    if (!seenFiles.has(cachedFile)) {
      cache.delete(cachedFile);
    }
  }
  rebuildAggregatedCards();
}

function scheduleDirectoryReload() {
  if (reloadTimer) {
    clearTimeout(reloadTimer);
  }
  reloadTimer = setTimeout(() => {
    reloadTimer = null;
    scanDataDirectory().catch(error => {
      console.error('Fehler beim Nachladen des Daten-Verzeichnisses:', error.message);
    });
  }, RELOAD_DELAY_MS);
}

function startDirectoryWatcher() {
  if (watcher) {
    return;
  }

  try {
    watcher = fs.watch(DATA_DIR, (eventType, filename) => {
      if (!filename || !filename.toLowerCase().endsWith(JSON_EXTENSION)) {
        return;
      }
      scheduleDirectoryReload();
    });

    watcher.on('error', error => {
      console.error('Dateiüberwachung fehlgeschlagen:', error.message);
      watcher.close();
      watcher = null;
      setTimeout(startDirectoryWatcher, RELOAD_DELAY_MS);
    });
  } catch (error) {
    console.error('Konnte Datenverzeichnis nicht überwachen:', error.message);
  }
}

async function initializeDataCache() {
  await ensureDataDirectory();
  await scanDataDirectory();
  startDirectoryWatcher();
}

function listCachedFiles() {
  return Array.from(cache.keys());
}

function getCachedFile(filename) {
  const sanitized = sanitizeFilename(filename);
  const snapshot = cache.get(sanitized);
  return snapshot ? deepCopy(snapshot) : null;
}

async function writeCacheFile(filename, payload) {
  const sanitized = sanitizeFilename(filename);
  const target = sanitized.toLowerCase().endsWith(JSON_EXTENSION)
    ? sanitized
    : `${sanitized}${JSON_EXTENSION}`;

  await ensureDataDirectory();
  const filePath = path.join(DATA_DIR, target);
  const serialized = JSON.stringify(payload, null, 2) + '\n';
  await fsp.writeFile(filePath, serialized, 'utf-8');

  cache.set(target, deepCopy(payload));
  rebuildAggregatedCards();
  return cache.get(target);
}

async function deleteCacheFile(filename) {
  const sanitized = sanitizeFilename(filename);
  const target = sanitized.toLowerCase().endsWith(JSON_EXTENSION)
    ? sanitized
    : `${sanitized}${JSON_EXTENSION}`;

  const filePath = path.join(DATA_DIR, target);
  try {
    await fsp.unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  cache.delete(target);
  rebuildAggregatedCards();
}

async function refreshDataCache() {
  await scanDataDirectory();
}

function rebuildAggregatedCards() {
  const combined = [];
  for (const [filename, data] of cache.entries()) {
    if (!data || !Array.isArray(data.cards)) {
      continue;
    }

    const editionName = data.edition || path.basename(filename, JSON_EXTENSION);
    const editionIdentifier = path.basename(filename, JSON_EXTENSION);

    for (const card of data.cards) {
      combined.push({
        edition_file: filename,
        edition_name: editionName,
        edition: editionIdentifier,
        ...card
      });
    }
  }
  aggregatedCards = combined;
}

function listAllCards() {
  return deepCopy(aggregatedCards);
}

function dataCacheMiddleware(req, res, next) {
  req.dataCache = {
    listFiles: () => listCachedFiles(),
    readFile: filename => getCachedFile(filename),
    writeFile: (filename, data) => writeCacheFile(filename, data),
    deleteFile: filename => deleteCacheFile(filename),
    refresh: () => refreshDataCache(),
    listAllCards: () => listAllCards()
  };
  next();
}

module.exports = {
  initializeDataCache,
  dataCacheMiddleware,
  listCachedFiles,
  getCachedFile,
  writeCacheFile,
  refreshDataCache,
  listAllCards
};
