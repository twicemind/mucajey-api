const axios = require('axios');

const SPOTIFY_CLIENT_ID = '66007e3910d34d6682bc0277104aea56';
const SPOTIFY_CLIENT_SECRET = '73ad472ce8ef487d85d8d7df78f403bc';

async function searchTracks() {
  // Get token
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
  
  // Load all tracks (308 tracks, need 4 requests)
  const allTracks = [];
  for (let offset = 0; offset < 400; offset += 100) {
    const response = await axios.get(
      `https://api.spotify.com/v1/playlists/26zIHVncgI9HmHlgYWwnDi/tracks?limit=100&offset=${offset}`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    allTracks.push(...response.data.items);
  }
  
  console.log(`Total tracks loaded: ${allTracks.length}\n`);
  
  // Search for Bob Sinclar/Sinclair + World Hold
  console.log("=== Bob Sinclar/Sinclair - World Hold ===");
  const bobTracks = allTracks.filter(item => {
    const artist = item.track.artists[0].name.toLowerCase();
    const title = item.track.name.toLowerCase();
    return artist.includes('sincla') || title.includes('world hold');
  });
  bobTracks.forEach(item => {
    console.log(`${item.track.name} - ${item.track.artists[0].name}`);
    console.log(`  Spotify ID: ${item.track.id}`);
  });
  
  // Search for Celine Dion + My Heart
  console.log("\n=== Celine Dion - My Heart ===");
  const celineTracks = allTracks.filter(item => {
    const artist = item.track.artists[0].name.toLowerCase();
    const title = item.track.name.toLowerCase();
    return artist.includes('celine') || title.includes('my heart');
  });
  celineTracks.forEach(item => {
    console.log(`${item.track.name} - ${item.track.artists[0].name}`);
    console.log(`  Spotify ID: ${item.track.id}`);
  });
}

searchTracks().catch(console.error);
