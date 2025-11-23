const express = require('express');
const fs = require('fs').promises;
const router = express.Router();
const { DATA_DIR } = require('../config');
const { loadJsonFile } = require('../utils/fileUtils');

// Alle verfügbaren Dateien auflisten
router.get('/', async (req, res) => {
  try {
    const files = await fs.readdir(DATA_DIR);
    const jsonFiles = files.filter(file => file.endsWith('.json'));
    res.json({ files: jsonFiles });
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Laden der Dateien', details: error.message });
  }
});

// Alle Daten aus allen JSON-Dateien zusammenführen
router.get('/all-data', async (req, res) => {
  try {
    const files = await fs.readdir(DATA_DIR);
    const jsonFiles = files.filter(file => 
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
            cardCount: data.cards ? data.cards.length : 0
          });
        }
        
        if (data.cards && Array.isArray(data.cards)) {
          for (const card of data.cards) {
            allCards.push({
              ...card,
              edition: data.edition || 'Unknown',
              language_short: data.language_short || 'de',
              language_long: data.language_long || 'Deutsch',
              source_file: file
            });
          }
        }
      } catch (fileError) {
        console.error(`Fehler beim Laden von ${file}:`, fileError.message);
      }
    }
    
    res.json({
      summary: {
        totalCards: allCards.length,
        totalEditions: editions.length,
        totalFiles: jsonFiles.length
      },
      editions: editions,
      cards: allCards
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Fehler beim Laden aller Daten', 
      details: error.message 
    });
  }
});

// Spezifische Datei laden
router.get('/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    
    if (!filename.endsWith('.json')) {
      return res.status(400).json({ error: 'Nur JSON-Dateien erlaubt' });
    }
    
    const data = await loadJsonFile(filename);
    res.json(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.status(404).json({ error: 'Datei nicht gefunden' });
    } else {
      res.status(500).json({ error: 'Fehler beim Laden der Datei', details: error.message });
    }
  }
});

module.exports = router;
