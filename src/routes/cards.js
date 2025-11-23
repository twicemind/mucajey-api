const express = require('express');
const router = express.Router();
const { loadJsonFile } = require('../utils/fileUtils');

// Karten nach Jahr filtern
router.get('/year/:year', async (req, res) => {
  try {
    const year = req.params.year;
    const data = await loadJsonFile('hitster-de.json');
    
    const filteredCards = data.cards.filter(card => card.year === year);
    res.json({
      edition: data.edition,
      year: year,
      count: filteredCards.length,
      cards: filteredCards
    });
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Filtern der Daten', details: error.message });
  }
});

// Karte nach ID suchen
router.get('/:id', async (req, res) => {
  try {
    const cardId = req.params.id;
    const data = await loadJsonFile('hitster-de.json');
    
    const card = data.cards.find(c => c.id === cardId);
    
    if (card) {
      res.json(card);
    } else {
      res.status(404).json({ error: 'Karte nicht gefunden' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Suchen der Karte', details: error.message });
  }
});

module.exports = router;
