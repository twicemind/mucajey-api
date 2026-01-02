const path = require('path');
const express = require('express');
const config = require('./config');
require('dotenv').config();
const {
  loadApiKeys,
  authenticateApiKey,
} = require('./middleware/mucajey/auth');
const {
  editionCacheMiddleware,
  initEditionCollection,
  listEditions,
} = require('./middleware/mongo/cache.edition');
const {
  cardCacheMiddleware,
  initCardCollection,
  listCards,
} = require('./middleware/mongo/cache.card');
const {
  serviceCacheMiddleware,
  initServiceCollection,
} = require('./middleware/mongo/cache.service');
const {
  userCacheMiddleware,
  initUserCollection,
} = require('./middleware/mongo/cache.user');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const passport = require('passport');
const { localStrategy } = require('./middleware/passport/strategy.local');

// Routes importieren
const healthRoutes = require('./routes/health');
const cardRoutes = require('./routes/v2/card');
const editionRoutes = require('./routes/v2/edition');
const editionImageRoutes = require('./routes/v2/edition-image');
const statsRoutes = require('./routes/v2/stats');
const registerRoutes = require('./routes/v2/register');
const authRoutes = require('./routes/v2/auth');
const loginRoutes = require('./routes/v2/login');

const app = express();

const openapiSpecPath = process.env.OPENAPI_SPEC_PATH
  ? path.resolve(process.cwd(), process.env.OPENAPI_SPEC_PATH)
  : path.join(__dirname, 'openapi', 'openapi.yaml');
const swaggerDocument = YAML.load(openapiSpecPath);
console.log(`📄 OpenAPI-Spezifikation: ${openapiSpecPath}`);

app.use(passport.initialize());
passport.use('local', localStrategy());

// Middleware
app.use(express.json());
app.use(editionCacheMiddleware);
app.use(cardCacheMiddleware);
app.use(serviceCacheMiddleware);
app.use(userCacheMiddleware);

// CORS
const corsOrigins = config.CORS_ORIGINS;
const allowAnyOrigin = corsOrigins.includes('*');

app.use((req, res, next) => {
  const origin = req.headers.origin;
  const isAllowedOrigin =
    origin && (allowAnyOrigin || corsOrigins.includes(origin));

  if (isAllowedOrigin) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  }

  res.header(
    'Access-Control-Allow-Headers',
    'Content-Type, X-API-Key, Authorization'
  );
  res.header(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, PATCH, DELETE, OPTIONS'
  );

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
});

// Routes (ohne Auth)
app.use('/', loginRoutes);
app.use('/register', registerRoutes);
app.use('/health', healthRoutes);

// Routes (mit Auth)
app.use('/card', authenticateApiKey, cardRoutes);
app.use('/edition/image', editionImageRoutes);
app.use('/edition', authenticateApiKey, editionRoutes);
app.use('/stats', authenticateApiKey, statsRoutes);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use('/auth', authRoutes);

// Server starten
async function startServer() {
  await initEditionCollection();
  await initCardCollection();
  await initServiceCollection();
  await initUserCollection();
  const cachedFiles = await listEditions();
  const cachedCards = await listCards();
  console.log(
    `🗂️  Cache-Status Editions: ${cachedFiles.length} Edition(s) in MongoDB${
      cachedFiles.length ? ` (${cachedFiles.join(', ')})` : ''
    }`
  );
  console.log(
    `🗂️  Cache-Status Cards: ${cachedCards.length} Cards(s) in MongoDB`
  );

  app.listen(process.env.PORT || config.PORT || 3000, async () => {
    await loadApiKeys();

    console.log(
      `🚀 Server is running at http://localhost:${process.env.PORT || config.PORT || 3000}`
    );
    console.log(`🔑 API-Keys Verzeichnis: ${config.API_KEYS_DIR}`);
    console.log(`🔑 API-Keys Datei: ${config.API_KEYS_FILE}`);
  });
}

startServer().catch(error => {
  console.error('Fehler beim Starten des Servers:', error);
  process.exit(1);
});
