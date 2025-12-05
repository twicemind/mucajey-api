/* eslint-env jest */

const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');

const editionRouter = require('../../../server/routes/v2/edition');

function deepCopy(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createTestContext() {
  const editions = new Map([
    [
      'hitster-classics.json',
      {
        edition: 'hitster-classics',
        edition_name: 'Hitster Classics',
        language_short: 'de',
        language_long: 'Deutsch',
        identifier: 'cls',
      },
    ],
  ]);

  const cardsByEdition = new Map([
    [
      'hitster-classics',
      [
        { id: '1', title: 'Song A', artist: 'Artist A', year: '1980' },
        { id: '2', title: 'Song B', artist: 'Artist B', year: '1981' },
      ],
    ],
  ]);

  const editionsCache = {
    async getAll() {
      return Array.from(editions.keys());
    },
    async get(filename) {
      return deepCopy(editions.get(filename));
    },
    async write(filename, payload) {
      editions.set(filename, deepCopy(payload));
      return this.get(filename);
    },
    async delete(filename) {
      editions.delete(filename);
    },
  };

  const cardsCache = {
    async getByEdition(editionId) {
      return deepCopy(cardsByEdition.get(editionId) || []);
    },
    async deleteMany(editionId) {
      cardsByEdition.delete(editionId);
    },
  };

  return { editionsCache, cardsCache, editions, cardsByEdition };
}

function buildApp(ctx) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.editionsCache = ctx.editionsCache;
    req.cardsCache = ctx.cardsCache;
    next();
  });
  app.use('/edition', editionRouter);
  return app;
}

test('GET /edition/all returns editions with card counts', async () => {
  const ctx = createTestContext();
  const app = buildApp(ctx);

  const res = await request(app).get('/edition/all').expect(200);

  assert.equal(res.body.message, 'Edition list retrieved from cache.');
  assert.equal(res.body.editions.length, 1);
  assert.equal(res.body.editions[0].cardCount, 2);
  assert.equal(res.body.editions[0].edition, 'hitster-classics');
});

test('POST /edition creates a new edition', async () => {
  const ctx = createTestContext();
  const app = buildApp(ctx);

  const res = await request(app)
    .post('/edition')
    .send({ edition: 'hitster-modern', edition_file: 'hitster-modern.json' })
    .expect(201);

  assert.equal(res.body.message, 'New edition file created.');
  assert(ctx.editions.has('hitster-modern.json'));
  assert.equal(
    ctx.editions.get('hitster-modern.json').edition,
    'hitster-modern'
  );
});

test('GET /edition/:edition returns edition metadata', async () => {
  const ctx = createTestContext();
  const app = buildApp(ctx);

  const res = await request(app).get('/edition/hitster-classics').expect(200);

  assert.equal(res.body.message, 'Edition hitster-classics loaded.');
  assert.equal(res.body.file.edition_name, 'Hitster Classics');
});

test('PUT /edition/:edition updates edition metadata', async () => {
  const ctx = createTestContext();
  const app = buildApp(ctx);

  const res = await request(app)
    .put('/edition/hitster-classics')
    .send({ edition_name: 'Hitster Classics Reloaded' })
    .expect(200);

  assert.equal(res.body.file.edition_name, 'Hitster Classics Reloaded');
  assert.equal(
    ctx.editions.get('hitster-classics.json').edition_name,
    'Hitster Classics Reloaded'
  );
});

test('DELETE /edition/:edition removes edition and cards', async () => {
  const ctx = createTestContext();
  const app = buildApp(ctx);

  const res = await request(app)
    .delete('/edition/hitster-classics')
    .expect(200);

  assert.equal(res.body.message, 'Edition hitster-classics deleted.');
  assert(!ctx.editions.has('hitster-classics.json'));
  assert(!ctx.cardsByEdition.has('hitster-classics'));
});

test('POST /edition requires edition or edition_file and prevents duplicates', async () => {
  const ctx = createTestContext();
  const app = buildApp(ctx);

  const missing = await request(app).post('/edition').send({}).expect(400);
  assert.equal(
    missing.body.error,
    'Edition identifier (`edition`) or target filename (`edition_file`) is required.'
  );

  const conflict = await request(app)
    .post('/edition')
    .send({ edition_file: 'hitster-classics.json' })
    .expect(409);
  assert.equal(conflict.body.error, 'Edition file already exists.');
});

test('GET /edition/:edition returns 404 when file cannot be resolved or loaded', async () => {
  const ctx = createTestContext();
  ctx.editionsCache.getAll = async () => []; // nothing to resolve
  const app = buildApp(ctx);

  const notFound = await request(app).get('/edition/unknown').expect(404);
  assert.equal(notFound.body.error, 'Edition file not found.');

  // now resolve but fail to load
  const ctx2 = createTestContext();
  ctx2.editionsCache.get = async () => undefined;
  const app2 = buildApp(ctx2);
  const loadFail = await request(app2)
    .get('/edition/hitster-classics')
    .expect(404);
  assert.equal(loadFail.body.error, 'Edition file could not be loaded.');
});

test('PUT /edition/:edition returns 404 when file is missing or cannot be loaded', async () => {
  const ctx = createTestContext();
  ctx.editionsCache.getAll = async () => []; // unresolved
  const app = buildApp(ctx);

  const notFound = await request(app)
    .put('/edition/unknown')
    .send({})
    .expect(404);
  assert.equal(notFound.body.error, 'Edition file not found.');

  const ctx2 = createTestContext();
  ctx2.editionsCache.get = async () => undefined; // load failure
  const app2 = buildApp(ctx2);
  const loadFail = await request(app2)
    .put('/edition/hitster-classics')
    .send({})
    .expect(404);
  assert.equal(loadFail.body.error, 'Edition file could not be loaded.');
});

test('DELETE /edition/:edition returns 404 when file is missing and 500 when delete fails', async () => {
  const ctx = createTestContext();
  ctx.editionsCache.getAll = async () => []; // unresolved
  const app = buildApp(ctx);

  const notFound = await request(app).delete('/edition/unknown').expect(404);
  assert.equal(notFound.body.error, 'Edition file not found.');

  const ctx2 = createTestContext();
  ctx2.editionsCache.delete = async () => {
    throw new Error('boom');
  };
  const app2 = buildApp(ctx2);
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  const fail = await request(app2)
    .delete('/edition/hitster-classics')
    .expect(500);
  assert.equal(fail.body.error, 'Edition file could not be deleted.');
  errorSpy.mockRestore();
});

test('GET /edition/ helper returns readiness message', async () => {
  const ctx = createTestContext();
  const app = buildApp(ctx);

  const res = await request(app).get('/edition/').expect(200);
  assert.ok(res.body.message.includes('Edition helper endpoint is ready.'));
});

test('resolveEditionFilename matches by lowercase when names differ', async () => {
  const editions = new Map([
    [
      'Hitster-CLASSICS.json',
      {
        edition: 'Hitster-CLASSICS',
        edition_name: 'Hitster Classics Upper',
      },
    ],
  ]);

  const ctx = {
    editionsCache: {
      async getAll() {
        return Array.from(editions.keys());
      },
      async get(filename) {
        return deepCopy(editions.get(filename));
      },
      async write() {},
      async delete() {},
    },
    cardsCache: {
      async getByEdition() {
        return [];
      },
      async deleteMany() {},
    },
    editions,
    cardsByEdition: new Map(),
  };

  const app = buildApp(ctx);

  const res = await request(app).get('/edition/hitster-classics').expect(200);
  assert.equal(res.body.file.edition_name, 'Hitster Classics Upper');
});
