const express = require('express');
const config = require('./config');
const { loadApiKeys, authenticateApiKey } = require('./middleware/auth');

// Routes importieren
const healthRoutes = require('./routes/health');
const filesRoutes = require('./routes/files');
const cardsRoutes = require('./routes/cards');
const scanRoutes = require('./routes/scan');
const importRoutes = require('./routes/import');
const syncRoutes = require('./routes/sync');
const searchRoutes = require('./routes/search');
const registerRoutes = require('./routes/register');

const app = express();

// Middleware
app.use(express.json());

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  next();
});

// Routes (ohne Auth)
app.use('/', healthRoutes);
app.use('/api/register', registerRoutes);

// Routes (mit Auth)
app.use('/api/files', authenticateApiKey, filesRoutes);
app.use('/api/cards', authenticateApiKey, cardsRoutes);
app.use('/api/import', authenticateApiKey, importRoutes);
app.use('/api/files', authenticateApiKey, syncRoutes); // Sync routes unter /api/files/:filename/...
app.use('/api/search', authenticateApiKey, searchRoutes);
app.use('/scan', authenticateApiKey, scanRoutes);

// Server starten
app.listen(config.PORT, async () => {
  await loadApiKeys();
  
  console.log(`🚀 Server läuft auf http://localhost:${config.PORT}`);
  console.log(`📁 Daten-Verzeichnis: ${config.DATA_DIR}`);
  console.log(`📝 Import-Datei: ${config.IMPORT_FILE}`);
  console.log(`🔑 API-Keys Verzeichnis: ${config.API_KEYS_DIR}`);
  console.log(`🔑 API-Keys Datei: ${config.API_KEYS_FILE}`);
  console.log(`\nVerfügbare Endpoints:`);
  console.log(`  GET  /health - Health Check`);
  console.log(`  POST /api/register - API-Key generieren`);
  console.log(`  GET  /api/files - Liste aller JSON-Dateien`);
  console.log(`  GET  /api/files/all-data - Alle Daten`);
  console.log(`  GET  /api/files/:filename - Datei laden`);
  console.log(`  POST /api/files - Neue Datei erstellen`);
  console.log(`  GET  /api/cards/:id - Karte nach ID`);
  console.log(`  GET  /api/cards/year/:year - Karten nach Jahr`);
  console.log(`  POST /api/cards - Neue Karte hinzufügen`);
  console.log(`  PUT  /api/cards/:filename/:cardId - Karte aktualisieren`);
  console.log(`  PATCH /api/cards/:edition/:cardId/apple - Apple Daten aktualisieren`);
  console.log(`  GET  /api/import - Import-Datei anzeigen`);
  console.log(`  DELETE /api/import - Import-Datei leeren`);
  console.log(`  POST /api/sync/spotify/:filename - Spotify Sync`);
  console.log(`  POST /api/sync/itunes/:filename - iTunes Sync`);
  console.log(`  GET  /api/search/itunes - iTunes Track suchen`);
  console.log(`  GET  /scan/:edition/:cardId - Karte scannen`);
});
