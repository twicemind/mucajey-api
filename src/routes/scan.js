const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { loadJsonFile } = require('../utils/fileUtils');
const { searchItunesTrack } = require('../utils/itunesUtils');
const config = require('../config');

// Gescannte Karte abrufen (mit Auto-Sync für Apple Music)
router.get('/:edition/:cardId', async (req, res) => {
  try {
    const { edition, cardId } = req.params;
    const filename = `hitster-de-${edition}.json`;
    
    let data;
    let actualFilename = filename;
    try {
      data = await loadJsonFile(filename);
    } catch (error) {
      if (error.code === 'ENOENT') {
        data = await loadJsonFile('hitster-de.json');
        actualFilename = 'hitster-de.json';
      } else {
        throw error;
      }
    }
    
    const card = data.cards.find(c => c.id === cardId);
    
    if (card) {
      let autoSynced = false;
      
      // Auto-Sync: Wenn keine Apple Music Daten vorhanden sind
      if (!card.apple || !card.apple.id) {
        console.log(`🔄 Auto-Sync für Karte ${cardId}: ${card.title} - ${card.artist}`);
        
        try {
          const country = data.country || 'de';
          const itunesResult = await searchItunesTrack(card.title, card.artist, country);
          
          if (itunesResult) {
            // Karte in Datei aktualisieren
            card.apple = {
              id: itunesResult.id,
              uri: itunesResult.uri
            };
            
            // Datei speichern
            const filePath = path.join(config.DATA_DIR, actualFilename);
            await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
            
            autoSynced = true;
            console.log(`✅ Auto-Sync erfolgreich für Karte ${cardId}: Apple ID ${itunesResult.id}`);
          } else {
            console.log(`⚠️  Auto-Sync fehlgeschlagen für Karte ${cardId}: Kein iTunes Match gefunden`);
          }
        } catch (syncError) {
          console.error(`❌ Auto-Sync Fehler für Karte ${cardId}:`, syncError.message);
          // Fehler beim Auto-Sync nicht an Client weitergeben
        }
      }
      
      res.json({
        edition: data.edition || edition,
        scanCode: `${edition}/${cardId}`,
        card: card,
        autoSynced: autoSynced
      });
    } else {
      res.status(404).json({ 
        error: 'Karte nicht gefunden',
        scanCode: `${edition}/${cardId}`
      });
    }
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Laden der Karte', details: error.message });
  }
});

// Nur Apple-ID abrufen
router.get('/:edition/:cardId/apple', async (req, res) => {
  try {
    const { edition, cardId } = req.params;
    const filename = `hitster-de-${edition}.json`;
    
    let data;
    try {
      data = await loadJsonFile(filename);
    } catch (error) {
      if (error.code === 'ENOENT') {
        data = await loadJsonFile('hitster-de.json');
      } else {
        throw error;
      }
    }
    
    const card = data.cards.find(c => c.id === cardId);
    
    if (card && card.apple && card.apple.id) {
      res.json({
        apple_id: card.apple.id,
        apple_uri: card.apple.uri || null
      });
    } else {
      res.status(404).json({ error: 'Apple Music Daten nicht gefunden' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Laden der Apple Daten', details: error.message });
  }
});

module.exports = router;
