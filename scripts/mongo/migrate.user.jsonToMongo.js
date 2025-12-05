// src/migrateAuthToMongo.js

require('dotenv').config();
const path = require('path');
const fs = require('fs');

// Mongo-Helper (müssen in deinem Projekt existieren)
const {
  writeApiKeys,
  writeUsers,
} = require('../../src/server/middleware/auth');

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
  console.log('🚀 Starte Migration von API-Keys & Users nach MongoDB...');

  //
  // 1) API-Keys migrieren -> Collection "service"
  //
  const apiKeyPath = resolveExistingPath('api-key.json', [
    // Pfade, die nacheinander geprüft werden
    '/data/api/api-key.json',
    path.join(process.cwd(), 'data/api/api-key.json'),
    path.join(process.cwd(), 'deployment/data/api/api-key.json'),
  ]);

  if (apiKeyPath) {
    const apiJson = loadJsonFile(apiKeyPath, 'api-key.json');
    if (apiJson && Array.isArray(apiJson.keys)) {
      console.log(`➡️ Migriere API-Keys (${apiJson.keys.length}) ...`);
      await writeApiKeys(apiJson.keys);
      console.log(
        '   ✅ API-Keys erfolgreich in MongoDB (Collection "service") gespeichert.'
      );
    } else {
      console.warn(
        '⚠️ api-key.json enthält kein gültiges "keys"-Array, überspringe.'
      );
    }
  } else {
    console.log('⚠️ API-Key-Migration übersprungen, keine Datei gefunden.');
  }

  //
  // 2) Users migrieren -> Collection "user"
  //
  const userPath = resolveExistingPath('user.json', [
    '/data/user/user.json',
    path.join(process.cwd(), 'data/user/user.json'),
    path.join(process.cwd(), 'deployment/data/user/user.json'),
  ]);

  if (userPath) {
    const userJson = loadJsonFile(userPath, 'user.json');
    if (userJson && Array.isArray(userJson.users)) {
      console.log(`➡️ Migriere Users (${userJson.users.length}) ...`);

      // 🔁 Users direkt an writeUsers geben – dort passiert die eigentliche
      // Transformation (apiKey -> apikeys[]).
      await writeUsers(userJson.users);

      console.log(
        '   ✅ Users erfolgreich in MongoDB (Collection "user") gespeichert.'
      );
    } else {
      console.warn(
        '⚠️ user.json enthält kein gültiges "users"-Array, überspringe.'
      );
    }
  } else {
    console.log('⚠️ User-Migration übersprungen, keine Datei gefunden.');
  }

  console.log('🎉 Migration abgeschlossen.');
}

// Script ausführen
runMigration()
  .then(() => {
    console.log('✅ migrateAuthToMongo erfolgreich beendet.');
    process.exit(0);
  })
  .catch(err => {
    console.error('💥 migrateAuthToMongo fehlgeschlagen:', err);
    process.exit(1);
  });
