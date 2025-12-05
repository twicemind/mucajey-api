const express = require('express');
const fs = require('fs').promises;
const router = express.Router();
const { DATA_DIR } = require('../../config');
const { loadJsonFile } = require('../../utils/client.file');
const result = require('../../utils/result');

// Alle verfügbaren Dateien auflisten
router.get('/', async (req, res) => {
  const doc = result.documentation({
    method: 'GET',
    path: '/',
    description: 'List all available files',
  });
  try {
    const files = await fs.readdir(DATA_DIR);
    const jsonFiles = files.filter(file => file.endsWith('.json'));
    const message = result.message({
      docs: doc,
      message: 'List of all available JSON files',
      data: {
        files: jsonFiles,
      },
    });
    res.json(message);
  } catch (error) {
    const errorMessage = result.error({
      docs: doc,
      error: 'Fehler beim Laden der Dateien',
      details: error.message,
    });
    res.status(500).json(errorMessage);
  }
});

// Alle Daten aus allen JSON-Dateien zusammenführen
router.get('/all-data', async (req, res) => {
  const doc = result.documentation({
    method: 'GET',
    path: '/all-data',
    description: 'Merge all data from all JSON files',
  });
  try {
    const files = await fs.readdir(DATA_DIR);
    const jsonFiles = files.filter(
      file =>
        file.endsWith('.json') &&
        file.startsWith('hitster-de') &&
        !file.includes('import')
    );

    let allCards = [];
    let editions = [];

    for (const file of jsonFiles) {
      try {
        const data = await loadJsonFile(file);

        if (data.edition && !editions.some(e => e.edition === data.edition)) {
          editions.push({
            edition: data.edition,
            language_short: data.language_short || 'de',
            language_long: data.language_long || 'Deutsch',
            identifier: data.identifier || '',
            file: file,
            cardCount: data.cards ? data.cards.length : 0,
          });
        }

        if (data.cards && Array.isArray(data.cards)) {
          for (const card of data.cards) {
            allCards.push({
              ...card,
              edition: data.edition || 'Unknown',
              language_short: data.language_short || 'de',
              language_long: data.language_long || 'Deutsch',
              source_file: file,
            });
          }
        }
      } catch (fileError) {
        const errorMessage = result.error({
          docs: doc,
          error: `Fehler beim Laden von ${file}`,
          details: fileError.message,
        });
        console.error(errorMessage);
      }
    }

    const message = result.message({
      docs: doc,
      message: 'All data merged from JSON files',
      data: {
        totalCards: allCards.length,
        totalEditions: editions.length,
        totalFiles: jsonFiles.length,
        editions: editions,
        cards: allCards,
      },
    });
    res.json(message);
  } catch (error) {
    const errorMessage = result.error({
      docs: doc,
      error: 'Fehler beim Laden aller Daten',
      details: error.message,
    });
    res.status(500).json(errorMessage);
  }
});

// Spezifische Datei laden
router.get('/:filename', async (req, res) => {
  const doc = result.documentation({
    method: 'GET',
    path: '/:filename',
    description: 'Load specific file',
  });
  try {
    const filename = req.params.filename;

    if (!filename.endsWith('.json')) {
      return res.status(400).json({ error: 'Nur JSON-Dateien erlaubt' });
    }

    const data = await loadJsonFile(filename);
    const message = result.message({
      docs: doc,
      message: `Datei ${filename} geladen.`,
      data: data,
    });
    res.json(message);
  } catch (error) {
    if (error.code === 'ENOENT') {
      const errorMessage = result.error({
        docs: doc,
        error: 'Datei nicht gefunden.',
      });
      res.status(404).json(errorMessage);
    } else {
      const errorMessage = result.error({
        docs: doc,
        error: 'Fehler beim Laden der Datei',
        details: error.message,
      });
      res.status(500).json(errorMessage);
    }
  }
});

module.exports = router;
