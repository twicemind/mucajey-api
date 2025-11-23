const express = require('express');
const router = express.Router();
const { searchItunesTrack } = require('../utils/itunesUtils');

// iTunes Track suchen
router.get('/itunes', async (req, res) => {
  try {
    const { title, artist, country = 'de' } = req.query;
    
    if (!title || !artist) {
      return res.status(400).json({ 
        error: 'Fehlende Parameter', 
        message: 'title und artist sind erforderlich' 
      });
    }
    
    const track = await searchItunesTrack(title, artist, country);
    
    if (track) {
      res.json({ 
        success: true,
        track: track,
        searched: { title, artist, country }
      });
    } else {
      res.status(404).json({ 
        error: 'Nicht gefunden',
        message: 'Kein passendes Ergebnis in iTunes gefunden',
        searched: { title, artist, country }
      });
    }
  } catch (error) {
    res.status(500).json({ error: 'Fehler bei der iTunes Suche', details: error.message });
  }
});

module.exports = router;
