/* eslint-env jest */

const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');

const statsRouter = require('../../../server/routes/v2/stats');

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
      },
    ],
    [
      'hitster-modern.json',
      {
        edition: 'hitster-modern',
        edition_name: 'Hitster Modern',
        language_short: 'en',
      },
    ],
  ]);

  const cards = [
    {
      id: '1',
      edition: 'hitster-classics',
      title: 'Song A',
      artist: 'Artist A',
      year: '1980',
      genre: 'Pop',
    },
    {
      id: '2',
      edition: 'hitster-classics',
      title: 'Song B',
      artist: 'Artist B',
      year: '1981',
      genre: 'Rock',
      apple: { id: 'apple1' },
    },
    {
      id: '3',
      edition: 'hitster-modern',
      title: 'Song C',
      artist: 'Artist C',
      year: '2000',
      genre: 'Pop',
      spotify: { id: 'spotify1' },
    },
  ];

  const editionsCache = {
    async getAll() {
      return Array.from(editions.keys());
    },
    async get(filename) {
      return deepCopy(editions.get(filename));
    },
  };

  const cardsCache = {
    async getAll() {
      return deepCopy(cards);
    },
    async getByEdition(editionId) {
      return deepCopy(cards.filter(card => card.edition === editionId));
    },
  };

  return { editionsCache, cardsCache };
}

function buildApp(ctx) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.editionsCache = ctx.editionsCache;
    req.cardsCache = ctx.cardsCache;
    next();
  });
  app.use('/stats', statsRouter);
  return app;
}

test('GET /stats aggregates cards and editions from caches', async () => {
  const ctx = createTestContext();
  const app = buildApp(ctx);

  const res = await request(app).get('/stats').expect(200);

  const { summary, editions } = res.body;

  assert.equal(
    res.body.message,
    'Statistics aggregated from the cached editions.'
  );
  assert.equal(summary.total_cards, 3);
  assert.equal(summary.total_editions, 2);
  assert.equal(summary.cards_with_apple_id, 1);
  assert.equal(summary.cards_with_spotify_id, 1);
  assert.equal(summary.cards_with_any_streaming, 2);
  assert.equal(summary.cards_missing_streaming, 1);
  assert.equal(summary.cards_per_edition['hitster-classics'], 2);
  assert.equal(editions.length, 2);
  assert.equal(
    editions.find(e => e.edition === 'hitster-classics').cardCount,
    2
  );
});
