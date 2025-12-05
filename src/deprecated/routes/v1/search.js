const express = require('express');
const router = express.Router();
const { searchItunesTrack } = require('../../utils/client.itunes');
const result = require('../../utils/result');

// iTunes Track suchen
router.get('/itunes', async (req, res) => {
  const doc = result.documentation({
    method: 'GET',
    path: '/itunes',
    description: 'Search iTunes track',
  });
  try {
    const { title, artist, country = 'de' } = req.query;

    if (!title || !artist) {
      const errorMessage = result.error({
        docs: doc,
        error: 'Fehlende Parameter',
        details: 'title und artist sind erforderlich',
      });
      return res.status(400).json(errorMessage);
    }

    const track = await searchItunesTrack(title, artist, country);

    if (track) {
      const message = result.message({
        docs: doc,
        message: 'iTunes Track gefunden',
        data: {
          track: track,
          searched: { title, artist, country },
        },
      });
      res.json(message);
    } else {
      const errorMessage = result.error({
        docs: doc,
        error: 'Nicht gefunden',
        details: 'Kein passendes Ergebnis in iTunes gefunden',
      });
      res.status(404).json(errorMessage);
    }
  } catch (error) {
    const errorMessage = result.error({
      docs: doc,
      error: 'Fehler bei der iTunes Suche',
      details: error.message,
    });
    res.status(500).json(errorMessage);
  }
});

module.exports = router;
