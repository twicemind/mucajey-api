const path = require('path');
const express = require('express');
const config = require('./config');
require('dotenv').config();
const { loadApiKeys, authenticateApiKey } = require('./middleware/auth');
//const { initializeDataCache, dataCacheMiddleware, listCachedFiles } = require('./middleware/dataCache');
const { initializeDataCache, dataCacheMiddleware, listCachedFiles } = require('./middleware/mongoDataCache');

// Routes importieren
const healthRoutes = require('./routes/health');
const filesRoutes = require('./routes/v1/files');
const cardsRoutes = require('./routes/v1/cards');
const importRoutes = require('./routes/v1/import');
const scanRoutes = require('./routes/v1/scan');
const syncRoutes = require('./routes/v1/sync');
const searchRoutes = require('./routes/v1/search');
const cardRoutes = require('./routes/v2/card');
const editionRoutes = require('./routes/v2/edition');
const statsRoutes = require('./routes/v2/stats');
const registerRoutes = require('./routes/register');
const appleRoutes = require('./routes/apple');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');

const app = express();

const openapiSpecPath = process.env.OPENAPI_SPEC_PATH
  ? path.resolve(process.cwd(), process.env.OPENAPI_SPEC_PATH)
  : path.join(__dirname, 'openapi', 'dist', 'openapi.yaml');
const swaggerDocument = YAML.load(openapiSpecPath);
console.log(`📄 OpenAPI-Spezifikation: ${openapiSpecPath}`);

// Middleware
app.use(express.json());
app.use(dataCacheMiddleware);

// CORS
const corsOrigins = config.CORS_ORIGINS;
const allowAnyOrigin = corsOrigins.includes('*');

app.use((req, res, next) => {
  const origin = req.headers.origin;
  const isAllowedOrigin = origin && (allowAnyOrigin || corsOrigins.includes(origin));

  if (isAllowedOrigin) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  }

  res.header('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
});

// Routes (ohne Auth)
app.use('/', healthRoutes);
app.use('/apple', appleRoutes);
app.use('/register', registerRoutes);

// Routes (mit Auth)
app.use('/v1/files', authenticateApiKey, filesRoutes);
app.use('/v1/cards', authenticateApiKey, cardsRoutes);
app.use('/v1/import', authenticateApiKey, importRoutes);
app.use('/v1/files', authenticateApiKey, syncRoutes);
app.use('/v1/search', authenticateApiKey, searchRoutes);
app.use('/v1/scan', authenticateApiKey, scanRoutes);
app.use('/card', authenticateApiKey, cardRoutes);
app.use('/edition', authenticateApiKey, editionRoutes);
app.use('/stats', authenticateApiKey, statsRoutes);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Server starten
async function startServer() {
  await initializeDataCache();
  const cachedFiles = await listCachedFiles();
  console.log(
    `🗂️  Cache-Status: ${cachedFiles.length} Edition(en) in MongoDB${
      cachedFiles.length ? ` (${cachedFiles.join(', ')})` : ''
    }`
  );

  app.listen(process.env.PORT || config.PORT || 3000, async () => {
    await loadApiKeys();

    console.log(`🚀 Server läuft auf http://localhost:${process.env.PORT || config.PORT || 3000}`);
    console.log(`📁 Daten-Verzeichnis: ${config.DATA_DIR}`);
    console.log(`📝 Import-Datei: ${config.IMPORT_FILE}`);
    console.log(`🔑 API-Keys Verzeichnis: ${config.API_KEYS_DIR}`);
    console.log(`🔑 API-Keys Datei: ${config.API_KEYS_FILE}`);
  });
}

startServer().catch(error => {
  console.error('Fehler beim Starten des Servers:', error);
  process.exit(1);
});
