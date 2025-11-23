const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { DATA_DIR } = require('../config');
const { loadJsonFile } = require('../utils/fileUtils');
const { getSpotifyPlaylistTracks, extractPlaylistId } = require('../utils/spotifyUtils');
const { searchItunesTrack } = require('../utils/itunesUtils');

// Spotify Playlist Sync
router.post('/:filename/spotify-sync', async (req, res) => {
  try {
    const filename = req.params.filename;
    
    if (!filename.match(/^hitster-de.*\.json$/) || filename.includes('import')) {
      return res.status(400).json({ 
        error: 'Ungültiger Dateiname',
        message: 'Nur hitster-de*.json Dateien erlaubt (außer import)'
      });
    }

    const data = await loadJsonFile(filename);
    
    if (!data.playlist || !data.playlist.url) {
      return res.status(400).json({ 
        error: 'Keine Playlist URL',
        message: 'Die Datei enthält keine Playlist URL'
      });
    }

    const playlistId = extractPlaylistId(data.playlist.url);
    if (!playlistId) {
      return res.status(400).json({ 
        error: 'Ungültige Playlist URL',
        message: 'Playlist ID konnte nicht extrahiert werden'
      });
    }

    const spotifyTracks = await getSpotifyPlaylistTracks(playlistId);
    
    let updated = 0;
    let skipped = 0;
    let notFound = 0;
    const updates = [];

    for (const card of data.cards) {
      if (card.spotify && card.spotify.id) {
        skipped++;
        continue;
      }

      const matchingTrack = spotifyTracks.find(track => {
        const titleMatch = track.name.toLowerCase().includes(card.title.toLowerCase()) ||
                          card.title.toLowerCase().includes(track.name.toLowerCase());
        const artistMatch = track.artists.toLowerCase().includes(card.artist.toLowerCase()) ||
                           card.artist.toLowerCase().includes(track.artists.toLowerCase());
        return titleMatch && artistMatch;
      });

      if (matchingTrack) {
        card.spotify = {
          id: matchingTrack.id,
          uri: matchingTrack.uri
        };
        updated++;
        updates.push({
          cardId: card.id,
          title: card.title,
          artist: card.artist,
          spotifyId: matchingTrack.id
        });
      } else {
        notFound++;
      }
    }

    const filePath = path.join(DATA_DIR, filename);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');

    res.json({
      message: 'Spotify Sync abgeschlossen',
      filename: filename,
      edition: data.edition,
      playlistId: playlistId,
      statistics: {
        totalCards: data.cards.length,
        updated: updated,
        skipped: skipped,
        notFound: notFound
      },
      updates: updates
    });
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Spotify Sync', details: error.message });
  }
});

// iTunes Sync
router.post('/:filename/itunes-sync', async (req, res) => {
  try {
    const filename = req.params.filename;
    const { country = 'de' } = req.body;
    
    if (!filename.match(/^hitster-de.*\.json$/) || filename.includes('import')) {
      return res.status(400).json({ 
        error: 'Ungültiger Dateiname',
        message: 'Nur hitster-de*.json Dateien erlaubt (außer import)'
      });
    }

    const data = await loadJsonFile(filename);
    
    let updated = 0;
    let skipped = 0;
    let notFound = 0;
    const updates = [];

    for (const card of data.cards) {
      if (card.apple && card.apple.id) {
        skipped++;
        continue;
      }

      const track = await searchItunesTrack(card.title, card.artist, country);
      
      if (track) {
        card.apple = {
          id: track.id,
          uri: track.uri
        };
        updated++;
        updates.push({
          cardId: card.id,
          title: card.title,
          artist: card.artist,
          appleId: track.id
        });
      } else {
        notFound++;
        console.log(`Card ${card.id} nicht gefunden: ${card.title} - ${card.artist}`);
      }

      // Rate limiting: 1 Request pro Sekunde
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const filePath = path.join(DATA_DIR, filename);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');

    res.json({
      message: 'iTunes Sync abgeschlossen',
      filename: filename,
      edition: data.edition,
      country: country,
      statistics: {
        totalCards: data.cards.length,
        updated: updated,
        skipped: skipped,
        notFound: notFound
      },
      updates: updates
    });
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim iTunes Sync', details: error.message });
  }
});

module.exports = router;
