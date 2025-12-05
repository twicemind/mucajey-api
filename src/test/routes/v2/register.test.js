/* eslint-env jest */

const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');

jest.mock('../../../server/middleware/mucajey/auth', () => ({
  generateSecureApiKey: jest.fn(() => 'new-key'),
  loadApiKeys: jest.fn(async () => {}),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

const registerRouter = require('../../../server/routes/v2/register');

function deepCopy(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createServiceCache(initial = []) {
  const services = initial.map(entry => ({ ...entry }));

  return {
    services,
    getAll: async () => deepCopy(services),
    update: async (key, updates) => {
      const target = services.find(entry => entry.key === key);
      if (!target) return undefined;
      Object.assign(target, updates);
      return deepCopy(target);
    },
    write: async entry => {
      services.push({ ...entry });
      return deepCopy(entry);
    },
  };
}

function buildApp(serviceCache) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.serviceCache = serviceCache;
    next();
  });
  app.use('/register', registerRouter);
  return app;
}

test('POST /register creates a new API key via service cache', async () => {
  const serviceCache = createServiceCache();
  const app = buildApp(serviceCache);

  const payload = {
    appName: 'MyApp',
    deviceId: 'device-1',
    appVersion: '1.0.0',
    platform: 'ios',
  };

  const res = await request(app).post('/register').send(payload).expect(201);

  assert.equal(res.body.message, 'API key successfully generated');
  assert.equal(res.body.apiKey, 'new-key');
  assert.equal(serviceCache.services.length, 1);
  assert.equal(serviceCache.services[0].appName, 'MyApp');
  assert.equal(serviceCache.services[0].deviceId, 'device-1');
});

test('POST /register returns existing API key and updates metadata', async () => {
  const initialEntry = {
    key: 'existing-key',
    appName: 'MyApp',
    deviceId: 'device-1',
    appVersion: '0.9.0',
    platform: null,
    createdAt: '2023-01-01T00:00:00.000Z',
    lastUsed: '2023-01-01T00:00:00.000Z',
    active: true,
  };
  const serviceCache = createServiceCache([initialEntry]);
  const app = buildApp(serviceCache);

  const res = await request(app)
    .post('/register')
    .send({
      appName: 'MyApp',
      deviceId: 'device-1',
      appVersion: '1.1.0',
      platform: 'android',
    })
    .expect(200);

  assert.equal(res.body.message, 'API key already registered');
  assert.equal(res.body.apiKey, 'existing-key');
  const stored = serviceCache.services[0];
  assert.equal(stored.appVersion, '1.1.0');
  assert.equal(stored.platform, 'android');
  assert.notEqual(stored.lastUsed, initialEntry.lastUsed);
});
