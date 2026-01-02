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
      'hitster-de-classics',
      {
        edition_id: 'hitster-de-classics',
        edition_name: 'Hitster Classics',
        language_short: 'de',
      },
    ],
    [
      'hitster-de-modern',
      {
        edition_id: 'hitster-de-modern',
        edition_name: 'Hitster Modern',
        language_short: 'en',
      },
    ],
  ]);

  // Canonical: edition_id; keep edition alias for compatibility
  const cards = [
    {
      id: '1',
      edition_id: 'hitster-de-classics',
      edition: 'hitster-de-classics',
      title: 'Song A',
      artist: 'Artist A',
      year: '1980',
      genre: 'Pop',
    },
    {
      id: '2',
      edition_id: 'hitster-de-classics',
      edition: 'hitster-de-classics',
      title: 'Song B',
      artist: 'Artist B',
      year: '1981',
      genre: 'Rock',
      apple: { id: 'apple1' },
    },
    {
      id: '3',
      edition_id: 'hitster-de-modern',
      edition: 'hitster-de-modern',
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
    async get(edition_id) {
      return deepCopy(editions.get(edition_id));
    },
  };

  const cardsCache = {
    async getAll() {
      return deepCopy(cards);
    },
    async getByEdition(edition_id) {
      // migration-safe: accept either edition_id or edition
      return deepCopy(
        cards.filter(
          c => c.edition_id === edition_id || c.edition === edition_id
        )
      );
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

  // Most implementations wrap payload into { data: ... }.
  // Keep a fallback for older shape to avoid brittle tests during refactors.
  const payload = res.body && res.body.data ? res.body.data : res.body;
  const { summary, editions } = payload;

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

  // cards_per_edition depends on router’s edition key logic.
  // With canonical cards containing edition_id and edition alias, this should be stable.
  assert.equal(summary.cards_per_edition['hitster-de-classics'], 2);

  assert.equal(editions.length, 2);

  const classics = editions.find(e => e.edition_id === 'hitster-de-classics');
  assert(classics, 'Expected edition summary for hitster-de-classics to exist');
  assert.equal(classics.cardCount, 2);
});
