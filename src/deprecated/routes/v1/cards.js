const express = require('express');
const router = express.Router();
const { loadJsonFile } = require('../../utils/client.file');
const result = require('../../utils/result');
// Karten nach Jahr filtern
router.get('/year/:year', async (req, res) => {
  const doc = result.documentation({
    method: 'GET',
    path: '/year/:year',
    description: 'Filter cards by year',
  });

  try {
    const year = req.params.year;
    const data = await loadJsonFile('hitster-de.json');

    const filteredCards = data.cards.filter(card => card.year === year);
    const message = result.message({
      docs: doc,
      message: 'Cards filtered by year',
      data: {
        edition: data.edition,
        year: year,
        count: filteredCards.length,
        cards: filteredCards,
      },
    });
    res.json(message);
  } catch (error) {
    const errorMessage = result.error({
      docs: doc,
      error: 'Fehler beim Filtern der Daten',
      details: error.message,
    });
    res.status(500).json(errorMessage);
  }
});

// Karte nach ID suchen
router.get('/:id', async (req, res) => {
  const doc = result.documentation({
    method: 'GET',
    path: '/:id',
    description: 'Search card by ID',
  });

  try {
    const cardId = req.params.id;
    const data = await loadJsonFile('hitster-de.json');

    const card = data.cards.find(c => c.id === cardId);

    if (card) {
      const message = result.message({
        docs: doc,
        message: 'Card found by ID',
        data: card,
      });
      res.json(message);
    } else {
      res.status(404).json({ error: 'Karte nicht gefunden' });
    }
  } catch (error) {
    const errorMessage = result.error({
      docs: doc,
      error: 'Fehler beim Suchen der Karte',
      details: error.message,
    });
    res.status(500).json(errorMessage);
  }
});

module.exports = router;
