/* eslint-env jest */

const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');

let mockAxios;
let mockConfig;

jest.mock('axios', () => ({
  get: (...args) => mockAxios.get(...args),
}));

jest.mock('../../../server/config', () => mockConfig);

function createTestContext() {
  const cards = [
    {
      edition: 'hitster-classics',
      edition_file: 'hitster-classics.json',
      edition_name: 'Hitster Classics',
      id: '1',
      title: 'Song A',
      artist: 'Artist A',
      year: '1980',
      genre: 'Pop',
    },
    {
      edition: 'hitster-modern',
      edition_file: 'hitster-modern.json',
      edition_name: 'Hitster Modern',
      id: '2',
      title: 'Song B',
      artist: 'Artist B',
      year: '2000',
      genre: 'Rock',
    },
  ];

  const editions = new Map([
    [
      'hitster-classics.json',
      { edition: 'hitster-classics', edition_name: 'Hitster Classics' },
    ],
    [
      'hitster-modern.json',
      { edition: 'hitster-modern', edition_name: 'Hitster Modern' },
    ],
  ]);

  const cardsCache = {
    async getAll() {
      return JSON.parse(JSON.stringify(cards));
    },
    async getByEdition(editionId) {
      return cards
        .filter(card => card.edition === editionId)
        .map(card => ({ ...card }));
    },
    async write(editionId, card) {
      const stored = { ...card, edition: editionId };
      cards.push(stored);
      return stored;
    },
    async update(editionId, cardId, updatedFields) {
      const target = cards.find(
        card => card.edition === editionId && String(card.id) === String(cardId)
      );

      if (!target) return undefined;

      Object.assign(target, updatedFields);
      return { ...target };
    },
    async delete(editionId, cardId) {
      const idx = cards.findIndex(
        card => card.edition === editionId && String(card.id) === String(cardId)
      );
      if (idx >= 0) {
        cards.splice(idx, 1);
      }
    },
  };

  const editionsCache = {
    async getAll() {
      return Array.from(editions.keys());
    },
    async get(filename) {
      return editions.get(filename);
    },
  };

  return { cardsCache, editionsCache, cards };
}

function buildApp(
  ctx,
  { appleToken = 'token', axiosGet = () => Promise.resolve({ data: {} }) } = {}
) {
  mockAxios = { get: axiosGet };
  mockConfig = { APPLE_MUSIC_API_TOKEN: appleToken, APPLE_MUSIC_STORE: 'de' };

  let cardRouter;
  jest.isolateModules(() => {
    cardRouter = require('../../../server/routes/v2/card');
  });

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.cardsCache = ctx.cardsCache;
    req.editionsCache = ctx.editionsCache;
    next();
  });
  app.use('/card', cardRouter);
  return app;
}

test('GET /card/all returns normalized cards', async () => {
  const ctx = createTestContext();
  const app = buildApp(ctx);

  const res = await request(app).get('/card/all').expect(200);

  assert.equal(res.body.message, 'All cards returned from cache.');
  assert.equal(res.body.cards.length, ctx.cards.length);
  assert.equal(res.body.cards[0].edition_name, 'Hitster Classics');
});

test('GET /card/id/:edition/:id finds card by edition and id', async () => {
  const ctx = createTestContext();
  const app = buildApp(ctx);

  const res = await request(app).get('/card/id/hitster-modern/2').expect(200);

  assert.equal(res.body.cards.id, '2');
  assert.equal(res.body.cards.edition, 'hitster-modern');
});

test('POST /card creates a card through the cache', async () => {
  const ctx = createTestContext();
  const app = buildApp(ctx);

  const payload = {
    edition: 'hitster-modern',
    id: '3',
    title: 'Song C',
    artist: 'Artist C',
    year: '2020',
  };

  const res = await request(app).post('/card').send(payload).expect(201);

  assert.equal(res.body.card.id, '3');
  assert.equal(res.body.card.edition, 'hitster-modern');
  assert.equal(ctx.cards.length, 3);
});

test('PATCH /card/:edition/:id updates card fields', async () => {
  const ctx = createTestContext();
  const app = buildApp(ctx);

  const res = await request(app)
    .patch('/card/hitster-classics/1')
    .send({ title: 'Song A (Remastered)' })
    .expect(200);

  assert.equal(res.body.card.title, 'Song A (Remastered)');
  assert.equal(
    ctx.cards.find(card => card.id === '1').title,
    'Song A (Remastered)'
  );
});

test('DELETE /card/:edition/:id removes the card', async () => {
  const ctx = createTestContext();
  const app = buildApp(ctx);

  const res = await request(app).delete('/card/hitster-classics/1').expect(200);

  assert.equal(res.body.message, 'Card 1 deleted.');
  assert.equal(ctx.cards.length, 1);
  assert(!ctx.cards.find(card => card.id === '1'));
});

test('GET /card/id/:edition/:id returns 404 when not found', async () => {
  const ctx = createTestContext();
  const app = buildApp(ctx);

  const res = await request(app).get('/card/id/hitster-modern/999').expect(404);
  assert.equal(res.body.error, 'Card not found.');
});

test('GET /card/ responds with helper message', async () => {
  const ctx = createTestContext();
  const app = buildApp(ctx);

  const res = await request(app).get('/card/').expect(200);
  assert.ok(res.body.message.includes('Card API is ready'));
});

test('POST /card validates edition and required fields', async () => {
  const ctx = createTestContext();
  const app = buildApp(ctx);

  const missingEdition = await request(app)
    .post('/card')
    .send({ id: '10' })
    .expect(400);
  assert.equal(
    missingEdition.body.error,
    'edition_file oder edition erforderlich'
  );

  const missingFields = await request(app)
    .post('/card')
    .send({ edition: 'hitster-classics' })
    .expect(400);
  assert.equal(
    missingFields.body.error,
    'id, title, artist und year müssen gesetzt sein'
  );
});

test('PATCH /card/:edition/:id returns 404 when card is missing', async () => {
  const ctx = createTestContext();
  const app = buildApp(ctx);

  const res = await request(app)
    .patch('/card/hitster-modern/999')
    .send({ title: 'x' })
    .expect(404);
  assert.equal(res.body.error, 'Karte nicht gefunden');
});

test('DELETE /card/:edition/:id returns 404 when card is missing', async () => {
  const ctx = createTestContext();
  const app = buildApp(ctx);

  const res = await request(app).delete('/card/hitster-modern/999').expect(404);
  assert.equal(res.body.error, 'Karte nicht gefunden');
});

test('GET /card/title/:title filters by exact title', async () => {
  const ctx = createTestContext();
  const app = buildApp(ctx);

  const res = await request(app).get('/card/title/Song A').expect(200);
  assert.equal(res.body.cards.length, 1);
  assert.equal(res.body.cards[0].id, '1');
});

test('GET /card/artist/:artist filters by exact artist', async () => {
  const ctx = createTestContext();
  const app = buildApp(ctx);

  const res = await request(app).get('/card/artist/Artist B').expect(200);
  assert.equal(res.body.cards.length, 1);
  assert.equal(res.body.cards[0].id, '2');
});

test('GET /card/year/:year filters by year', async () => {
  const ctx = createTestContext();
  const app = buildApp(ctx);

  const res = await request(app).get('/card/year/1980').expect(200);
  assert.equal(res.body.cards.length, 1);
  assert.equal(res.body.cards[0].id, '1');
});

test('GET /card/edition/:edition filters by edition', async () => {
  const ctx = createTestContext();
  const app = buildApp(ctx);

  const res = await request(app)
    .get('/card/edition/hitster-modern')
    .expect(200);
  assert.equal(res.body.cards.length, 1);
  assert.equal(res.body.cards[0].id, '2');
});

test('GET /card/genre/:genre filters by genre', async () => {
  const ctx = createTestContext();
  const app = buildApp(ctx);

  const res = await request(app).get('/card/genre/Rock').expect(200);
  assert.equal(res.body.cards.length, 1);
  assert.equal(res.body.cards[0].id, '2');
});

test('GET /card/search/:query matches substrings across fields', async () => {
  const ctx = createTestContext();
  const app = buildApp(ctx);

  const res = await request(app).get('/card/search/artist a').expect(200);
  assert.equal(res.body.cards.length, 1);
  assert.equal(res.body.cards[0].id, '1');
});

test('POST /card/:edition/:id/apple/search handles missing token', async () => {
  const ctx = createTestContext();
  const app = buildApp(ctx, { appleToken: '' });

  const res = await request(app)
    .post('/card/hitster-classics/1/apple/search')
    .expect(500);
  assert.equal(res.body.error, 'Apple Music token is not configured');
});

test('POST /card/:edition/:id/apple/search returns 404 when card missing', async () => {
  const ctx = createTestContext();
  ctx.cardsCache.getByEdition = async () => [];
  const app = buildApp(ctx);

  const res = await request(app)
    .post('/card/hitster-classics/999/apple/search')
    .expect(404);
  assert.equal(res.body.error, 'Card not found');
});

test('POST /card/:edition/:id/apple/search requires searchable metadata', async () => {
  const ctx = createTestContext();
  ctx.cardsCache.getByEdition = async () => [{ id: '1' }]; // no title/artist/year
  const app = buildApp(ctx);

  const res = await request(app)
    .post('/card/hitster-classics/1/apple/search')
    .expect(400);
  assert.equal(res.body.error, 'Card missing searchable metadata');
});

test('POST /card/:edition/:id/apple/search returns 404 when no match', async () => {
  const ctx = createTestContext();
  const axiosGet = jest
    .fn()
    .mockResolvedValue({ data: { results: { songs: { data: [] } } } });
  const app = buildApp(ctx, { axiosGet });

  const res = await request(app)
    .post('/card/hitster-classics/1/apple/search')
    .expect(404);
  assert.equal(res.body.error, 'No Apple Music match found');
});

test('POST /card/:edition/:id/apple/search updates card with Apple data', async () => {
  const ctx = createTestContext();
  const update = jest.fn(async (_edition, _id, fields) => ({
    ...ctx.cards[0],
    ...fields,
  }));
  ctx.cardsCache.update = update;
  ctx.cardsCache.getByEdition = async () => [ctx.cards[0]];

  const axiosGet = jest.fn().mockResolvedValue({
    data: {
      results: {
        songs: {
          data: [
            {
              id: 'apple123',
              attributes: {
                url: 'https://apple.example/song',
                previews: [{ url: 'https://apple.example/preview' }],
              },
            },
          ],
        },
      },
    },
  });

  const app = buildApp(ctx, { axiosGet, appleToken: 'token' });

  const res = await request(app)
    .post('/card/hitster-classics/1/apple/search')
    .expect(200);
  assert.equal(res.body.card.apple.id, 'apple123');
  assert.equal(update.mock.calls.length, 1);
});

test('POST /card/:edition/:id/apple/search returns 502 on axios error', async () => {
  const ctx = createTestContext();
  const axiosGet = jest.fn().mockRejectedValue(new Error('network down'));
  const app = buildApp(ctx, { axiosGet, appleToken: 'token' });

  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  const res = await request(app)
    .post('/card/hitster-classics/1/apple/search')
    .expect(502);
  assert.equal(res.body.error, 'Apple Music lookup failed');
  errorSpy.mockRestore();
});
