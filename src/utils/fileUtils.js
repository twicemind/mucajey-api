const fs = require('fs').promises;
const path = require('path');
const { DATA_DIR, IMPORT_FILE } = require('../config');

// JSON-Datei laden
async function loadJsonFile(filename) {
  const filePath = path.join(DATA_DIR, filename);
  const data = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(data);
}

// Import-Datei initialisieren falls nicht vorhanden
async function ensureImportFile() {
  try {
    await fs.access(IMPORT_FILE);
  } catch (error) {
    const initialData = {
      edition: "Hitster Deutschland - Import",
      language_short: "de",
      language_long: "Deutsch",
      identifier: "import",
      imports: []
    };
    await fs.writeFile(IMPORT_FILE, JSON.stringify(initialData, null, 2), 'utf-8');
  }
}

// Generiere eindeutige Import-ID
function generateImportId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `IMP-${timestamp}-${random}`;
}

// Import-Datei laden
async function loadImportFile() {
  await ensureImportFile();
  const data = await fs.readFile(IMPORT_FILE, 'utf-8');
  return JSON.parse(data);
}

// Import-Datei speichern
async function saveImportFile(data) {
  await fs.writeFile(IMPORT_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// Validierung der Kartendaten
function validateCard(card) {
  const errors = [];
  
  if (!card.id || typeof card.id !== 'string') {
    errors.push('ID ist erforderlich und muss ein String sein');
  }
  if (!card.title || typeof card.title !== 'string') {
    errors.push('Titel ist erforderlich und muss ein String sein');
  }
  if (!card.artist || typeof card.artist !== 'string') {
    errors.push('Künstler ist erforderlich und muss ein String sein');
  }
  if (!card.year || typeof card.year !== 'string') {
    errors.push('Jahr ist erforderlich und muss ein String sein');
  }
  if (!card.edition || typeof card.edition !== 'string') {
    errors.push('Edition ist erforderlich und muss ein String sein');
  }
  if (!card.language_short || typeof card.language_short !== 'string') {
    errors.push('language_short ist erforderlich und muss ein String sein');
  }
  if (!card.language_long || typeof card.language_long !== 'string') {
    errors.push('language_long ist erforderlich und muss ein String sein');
  }
  
  return errors;
}

module.exports = {
  loadJsonFile,
  ensureImportFile,
  generateImportId,
  loadImportFile,
  saveImportFile,
  validateCard
};
