const axios = require('axios');

const SPOTIFY_CLIENT_ID = '66007e3910d34d6682bc0277104aea56';
const SPOTIFY_CLIENT_SECRET = '73ad472ce8ef487d85d8d7df78f403bc';

async function checkPlaylist() {
  const authResponse = await axios.post(
    'https://accounts.spotify.com/api/token',
    'grant_type=client_credentials',
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET).toString('base64')
      }
    }
  );
  
  const token = authResponse.data.access_token;
  
  const response = await axios.get(
    'https://api.spotify.com/v1/playlists/58y9xPPIRWd8tqlOaKoDOI',
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  
  console.log(`Playlist: ${response.data.name}`);
  console.log(`Total Tracks in Playlist: ${response.data.tracks.total}`);
}

checkPlaylist().catch(console.error);
