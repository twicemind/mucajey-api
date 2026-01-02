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
      'hitster-de-classics',
      {
        edition_id: 'hitster-de-classics',
        edition_name: 'Hitster Classics',
        language_short: 'de',
        language_long: 'Deutsch',
        identifier: 'cls',
        spotify_playlist: 'spotify:playlist:example',
      },
    ],
  ]);

  const cardsByEdition = new Map([
    [
      'hitster-de-classics',
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
    async get(edition_id) {
      return deepCopy(editions.get(edition_id));
    },
    async write(edition_id, payload) {
      editions.set(edition_id, deepCopy(payload));
      return this.get(edition_id);
    },
    async delete(edition_id) {
      editions.delete(edition_id);
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
  assert.equal(res.body.editions[0].edition_id, 'hitster-de-classics');
});

test('POST /edition creates a new edition', async () => {
  const ctx = createTestContext();
  const app = buildApp(ctx);

  const res = await request(app)
    .post('/edition')
    .send({ edition_id: 'hitster-de-modern', edition_name: 'Hitster Modern' })
    .expect(201);

  assert.equal(res.body.message, 'New edition edition_id created.');
  assert(ctx.editions.has('hitster-de-modern'));
  assert.equal(
    ctx.editions.get('hitster-de-modern').edition_id,
    'hitster-de-modern'
  );
});

test('GET /edition/:edition_id returns edition metadata', async () => {
  const ctx = createTestContext();
  const app = buildApp(ctx);

  const res = await request(app)
    .get('/edition/hitster-de-classics')
    .expect(200);

  assert.equal(res.body.message, 'Edition hitster-de-classics loaded.');
  assert.equal(res.body.edition.edition_id, 'hitster-de-classics');
});

test('PUT /edition/:edition_id updates edition metadata', async () => {
  const ctx = createTestContext();
  const app = buildApp(ctx);

  const res = await request(app)
    .put('/edition/hitster-de-classics')
    .send({ edition_name: 'Hitster Classics Reloaded' })
    .expect(200);

  assert.equal(res.body.edition.edition_name, 'Hitster Classics Reloaded');
  assert.equal(
    ctx.editions.get('hitster-de-classics').edition_name,
    'Hitster Classics Reloaded'
  );
});

test('DELETE /edition/:edition_id removes edition and cards', async () => {
  const ctx = createTestContext();
  const app = buildApp(ctx);

  const res = await request(app)
    .delete('/edition/hitster-de-classics')
    .expect(200);

  assert.equal(res.body.message, 'Edition hitster-de-classics deleted.');
  assert(!ctx.editions.has('hitster-de-classics'));
  assert(!ctx.cardsByEdition.has('hitster-de-classics'));
});

test('POST /edition requires edition or edition_id and prevents duplicates', async () => {
  const ctx = createTestContext();
  const app = buildApp(ctx);

  const missing = await request(app).post('/edition').send({}).expect(400);
  assert.equal(
    missing.body.error,
    'Edition identifier (`edition`) or target edition_id (`edition_id`) is required.'
  );

  const conflict = await request(app)
    .post('/edition')
    .send({ edition_id: 'hitster-de-classics' })
    .expect(409);
  assert.equal(conflict.body.error, 'Edition edition_id already exists.');
});

test('GET /edition/:edition_id returns 404 when edition_id cannot be resolved or loaded', async () => {
  const ctx = createTestContext();
  ctx.editionsCache.getAll = async () => []; // nothing to resolve
  const app = buildApp(ctx);

  const notFound = await request(app).get('/edition/unknown').expect(404);
  assert.equal(notFound.body.error, 'Edition edition_id not found.');

  // now resolve but fail to load
  const ctx2 = createTestContext();
  ctx2.editionsCache.get = async () => undefined;
  const app2 = buildApp(ctx2);
  const loadFail = await request(app2)
    .get('/edition/hitster-de-classics')
    .expect(404);
  assert.equal(loadFail.body.error, 'Edition edition_id could not be loaded.');
});

test('PUT /edition/:edition_id returns 404 when edition_id is missing or cannot be loaded', async () => {
  const ctx = createTestContext();
  ctx.editionsCache.getAll = async () => []; // unresolved
  const app = buildApp(ctx);

  const notFound = await request(app)
    .put('/edition/unknown')
    .send({})
    .expect(404);
  assert.equal(notFound.body.error, 'Edition edition_id not found.');

  const ctx2 = createTestContext();
  ctx2.editionsCache.get = async () => undefined; // load failure
  const app2 = buildApp(ctx2);
  const loadFail = await request(app2)
    .put('/edition/hitster-de-classics')
    .send({})
    .expect(404);
  assert.equal(loadFail.body.error, 'Edition edition_id could not be loaded.');
});

test('DELETE /edition/:edition_id returns 404 when edition_id is missing and 500 when delete fails', async () => {
  const ctx = createTestContext();
  ctx.editionsCache.getAll = async () => []; // unresolved
  const app = buildApp(ctx);

  const notFound = await request(app).delete('/edition/unknown').expect(404);
  assert.equal(notFound.body.error, 'Edition edition_id not found.');

  const ctx2 = createTestContext();
  ctx2.editionsCache.delete = async () => {
    throw new Error('boom');
  };
  const app2 = buildApp(ctx2);
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  const fail = await request(app2)
    .delete('/edition/hitster-de-classics')
    .expect(500);
  assert.equal(fail.body.error, 'Edition edition_id could not be deleted.');
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
      'hitster-de-classics',
      {
        edition_id: 'hitster-de-classics',
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

  const res = await request(app)
    .get('/edition/hitster-de-classics')
    .expect(200);
  assert.equal(res.body.edition.edition_name, 'Hitster Classics Upper');
});
