/* eslint-env jest */

const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');

const healthRouter = require('../../server/routes/health');

function buildApp() {
  const app = express();
  app.use('/', healthRouter);
  return app;
}

test('GET /health responds with ok status', async () => {
  const app = buildApp();

  const res = await request(app).get('/health').expect(200);

  assert.equal(res.body.message, 'API is healthy and running.');
  assert.equal(res.body.status, 'ok');
  assert.equal(res.body.service, 'mucajey API');
  assert(res.body.timestamp);
  assert.equal(res.body.docs.path, '/health');
});
