// src/migrateJsonToMongo.js

require('dotenv').config(); // falls du .env verwendest

// Altes File-basierendes Modul
const {
  initializeDataCache,
  listCachedFiles,
  getCachedFile,
} = require('../../middleware/dataCache');

// Neues Mongo-Modul
const {
  writeFile, // unsere Mongo-Variante
} = require('../../middleware/mongoDataCache');

async function runMigration() {
  console.log('🚀 Starte Migration von JSON-Files nach MongoDB...');

  // 1. Alten File-Cache initialisieren (liest alle JSON-Files ein)
  await initializeDataCache();

  // 2. Liste aller „Dateien“ (JSON-Files)
  const files = listCachedFiles();
  console.log(`🗂️ Gefundene JSON-Dateien: ${files.length}`);
  if (!files.length) {
    console.log('⚠️ Keine Dateien gefunden, nichts zu migrieren.');
    return;
  }

  // 3. Jede Datei laden und in Mongo schreiben
  for (const file of files) {
    const data = getCachedFile(file); // synchron, aus In-Memory-Cache
    if (!data) {
      console.warn(`⚠️ Konnte '${file}' nicht aus dem Cache lesen, überspringe.`);
      continue;
    }

    const cardsCount = Array.isArray(data.cards) ? data.cards.length : 0;
    console.log(`➡️ Migriere '${file}' (Cards: ${cardsCount}) ...`);

    // writeFile kommt aus mongoDataCache:
    // - erzeugt/aktualisiert einen Edition-Datensatz
    // - legt alle Cards dazu in der card-Collection an
    await writeFile(file, data);
  }

  console.log('✅ Migration abgeschlossen.');
}

runMigration()
  .then(() => {
    console.log('🎉 Alle JSON-Files wurden nach MongoDB übertragen.');
    process.exit(0);
  })
  .catch(err => {
    console.error('💥 Migration fehlgeschlagen:', err);
    process.exit(1);
  });