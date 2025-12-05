// scripts/mongo/migrate.service.apiKeysToMongo.js

require('dotenv').config();
const path = require('path');
const fs = require('fs');

// Mongo-Helper (müssen in deinem Projekt existieren)
const { writeApiKeys } = require('../../src/server/middleware/auth');

/**
 * Hilfsfunktion: Nimm den ersten existierenden Pfad aus einer Liste.
 */
function resolveExistingPath(label, candidates) {
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      console.log(`✅ Verwende ${label}-Datei: ${p}`);
      return p;
    }
  }
  console.log(
    `⚠️ Keine ${label}-Datei gefunden (getestet: ${candidates.join(', ')})`
  );
  return null;
}

/**
 * JSON-Datei synchron laden und parsen.
 */
function loadJsonFile(filePath, label) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const json = JSON.parse(raw);
    return json;
  } catch (err) {
    console.error(
      `💥 Fehler beim Lesen/Parsen von ${label} (${filePath}):`,
      err
    );
    return null;
  }
}

async function runMigration() {
  console.log('🚀 Starte Migration der Service-API-Keys nach MongoDB...');

  // API-Keys migrieren -> Collection "service"
  const apiKeyPath = resolveExistingPath('api-keys.json', [
    // Pfade, die nacheinander geprüft werden
    '/data/api/api-keys.json',
    path.join(process.cwd(), 'data/api/api-keys.json'),
    path.join(process.cwd(), 'deployment/data/api/api-keys.json'),
  ]);

  if (!apiKeyPath) {
    console.log(
      '⚠️ API-Key-Migration übersprungen, keine api-key.json-Datei gefunden.'
    );
    return;
  }

  const apiJson = loadJsonFile(apiKeyPath, 'api-keys.json');
  if (!apiJson || !Array.isArray(apiJson.keys)) {
    console.warn(
      '⚠️ api-key.json enthält kein gültiges "keys"-Array, Migration abgebrochen.'
    );
    return;
  }

  console.log(
    `➡️ Migriere API-Keys (${apiJson.keys.length}) in Collection "service"...`
  );
  await writeApiKeys(apiJson.keys);
  console.log(
    '   ✅ API-Keys erfolgreich in MongoDB (Collection "service") gespeichert.'
  );

  console.log('🎉 Migration der Service-API-Keys abgeschlossen.');
}

// Script ausführen
runMigration()
  .then(() => {
    console.log('✅ migrate.service.apiKeysToMongo erfolgreich beendet.');
    process.exit(0);
  })
  .catch(err => {
    console.error('💥 migrate.service.apiKeysToMongo fehlgeschlagen:', err);
    process.exit(1);
  });
