const path = require('path');

const cleanList = raw =>
  (raw || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);

module.exports = {
  PORT: process.env.PORT || 3000,
  DATA_DIR: path.join('/app/data/cards'),
  IMPORT_FILE: path.join('/app/data/cards', 'hitster-de-import.json'),
  API_KEYS_DIR: path.join('/app/data/api'),
  API_KEYS_FILE: path.join('/app/data/api', 'api-keys.json'),
  MASTER_API_KEY: process.env.API_KEY || 'mucajey-dev-key-2024',
  SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID || '',
  SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET || '',
  CORS_ORIGINS: cleanList(process.env.CORS_ORIGINS || 'http://localhost:3000')
};
