const axios = require('axios');
const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET } = require('../config');

let spotifyAccessToken = null;
let spotifyTokenExpiry = 0;

/**
 * Holt einen Spotify Access Token via Client Credentials Flow
 */
async function getSpotifyAccessToken() {
  if (spotifyAccessToken && Date.now() < spotifyTokenExpiry) {
    return spotifyAccessToken;
  }

  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    throw new Error('Spotify API Credentials nicht konfiguriert (SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET)');
  }

  try {
    const authString = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');
    
    const response = await axios.post('https://accounts.spotify.com/api/token', 
      'grant_type=client_credentials',
      {
        headers: {
          'Authorization': `Basic ${authString}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    spotifyAccessToken = response.data.access_token;
    spotifyTokenExpiry = Date.now() + (55 * 60 * 1000);
    
    return spotifyAccessToken;
  } catch (error) {
    console.error('Fehler beim Abrufen des Spotify Access Tokens:', error.response?.data || error.message);
    throw new Error('Spotify Authentifizierung fehlgeschlagen');
  }
}

/**
 * Extrahiert Playlist ID aus Spotify URL
 */
function extractPlaylistId(playlistUrl) {
  if (!playlistUrl) return null;
  const match = playlistUrl.match(/playlist\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

/**
 * Lädt alle Tracks einer Spotify Playlist
 */
async function getSpotifyPlaylistTracks(playlistId) {
  const token = await getSpotifyAccessToken();
  const allTracks = [];
  let nextUrl = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;

  try {
    while (nextUrl) {
      const response = await axios.get(nextUrl, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const items = response.data.items || [];
      
      for (const item of items) {
        if (item.track && item.track.id) {
          allTracks.push({
            id: item.track.id,
            uri: item.track.uri,
            url: item.track.external_urls?.spotify || '',
            name: item.track.name,
            artists: item.track.artists?.map(a => a.name).join(', ') || '',
            album: item.track.album?.name || '',
            releaseDate: item.track.album?.release_date || ''
          });
        }
      }

      nextUrl = response.data.next;
    }

    return allTracks;
  } catch (error) {
    console.error('Fehler beim Abrufen der Playlist Tracks:', error.response?.data || error.message);
    throw new Error(`Fehler beim Abrufen der Spotify Playlist: ${error.message}`);
  }
}

module.exports = {
  getSpotifyAccessToken,
  extractPlaylistId,
  getSpotifyPlaylistTracks
};
