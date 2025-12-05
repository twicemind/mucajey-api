/* eslint-env jest */

const assert = require('node:assert/strict');
const nodeCrypto = require('crypto');

function deepCopy(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createMockCollection(initial = []) {
  const docs = initial.map(entry => ({ ...entry }));
  const calls = { find: [], updateOne: [], deleteOne: [] };

  const matches = (doc, filter = {}) =>
    Object.entries(filter).every(([key, val]) => doc[key] === val);

  return {
    calls,
    all: docs,
    find(filter = {}) {
      calls.find.push(filter);
      const result = docs.filter(doc => matches(doc, filter));
      return {
        toArray: async () => deepCopy(result),
      };
    },
    async updateOne(filter = {}, update = {}, options = {}) {
      calls.updateOne.push({ filter, update, options });
      const idx = docs.findIndex(doc => matches(doc, filter));
      const set = update.$set || {};

      if (idx >= 0) {
        docs[idx] = { ...docs[idx], ...set };
      } else if (options.upsert) {
        docs.push({ ...filter, ...set });
      }
    },
    async deleteOne(filter = {}) {
      calls.deleteOne.push(filter);
      const idx = docs.findIndex(doc => matches(doc, filter));
      if (idx >= 0) {
        docs.splice(idx, 1);
      }
    },
  };
}

let mockServiceCollection;
let mockMasterKey = 'master-key';

jest.mock('../../../server/utils/client.mongo.js', () => ({
  getMucajeyDb: async () => ({
    collection: name => {
      if (name !== 'service') {
        throw new Error(`Unknown collection requested: ${name}`);
      }
      return mockServiceCollection;
    },
  }),
}));

jest.mock('../../../server/config.js', () => ({
  get MASTER_API_KEY() {
    return mockMasterKey;
  },
}));

function loadAuth({ serviceDocs = [], masterKey = 'master-key' } = {}) {
  mockServiceCollection = createMockCollection(serviceDocs);
  mockMasterKey = masterKey;

  let auth;
  jest.isolateModules(() => {
    auth = require('../../../server/middleware/mucajey/auth.js');
  });

  auth.apiKeysStore.keys = [];
  auth.apiKeysStore.loaded = false;

  return { auth, serviceCollection: mockServiceCollection };
}

function createRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test('generateSecureApiKey uses crypto.randomBytes(32) to produce a hex string', () => {
  const { auth } = loadAuth();
  const realRandomBytes = nodeCrypto.randomBytes;
  const calls = [];

  try {
    nodeCrypto.randomBytes = size => {
      calls.push(size);
      return Buffer.alloc(size, 0xab);
    };

    const key = auth.generateSecureApiKey();
    assert.equal(calls[0], 32);
    assert.equal(key, Buffer.alloc(32, 0xab).toString('hex'));
    assert.equal(key.length, 64);
  } finally {
    nodeCrypto.randomBytes = realRandomBytes;
  }
});

test('loadApiKeys pulls keys from Mongo and caches them', async () => {
  const fixtures = [
    { key: 'alpha', active: true },
    { key: 'beta', active: false },
  ];
  const { auth, serviceCollection } = loadAuth({ serviceDocs: fixtures });

  const result = await auth.loadApiKeys();
  assert.deepEqual(result, fixtures);
  assert.deepEqual(auth.apiKeysStore.keys, fixtures);
  assert.equal(auth.apiKeysStore.loaded, true);
  assert.equal(serviceCollection.calls.find.length, 1);
});

test('isValidApiKey returns true for the master key without loading the cache', async () => {
  const { auth, serviceCollection } = loadAuth({ masterKey: 'super-master' });

  const valid = await auth.isValidApiKey('super-master');
  assert.equal(valid, true);
  assert.equal(auth.apiKeysStore.loaded, false);
  assert.equal(serviceCollection.calls.find.length, 0);
});

test('isValidApiKey loads cache once and respects active flag', async () => {
  const { auth, serviceCollection } = loadAuth({
    serviceDocs: [
      { key: 'active-key', active: true },
      { key: 'inactive-key', active: false },
    ],
  });

  const first = await auth.isValidApiKey('active-key');
  const second = await auth.isValidApiKey('inactive-key');

  assert.equal(first, true);
  assert.equal(second, false);
  assert.equal(auth.apiKeysStore.loaded, true);
  assert.equal(serviceCollection.calls.find.length, 1);
});

test('authenticateApiKey returns 401 when header is missing', async () => {
  const { auth } = loadAuth();
  const req = { headers: {} };
  const res = createRes();
  let nextCalled = false;

  await auth.authenticateApiKey(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, 'API-Key erforderlich');
  assert.equal(res.body.message, 'Bitte fügen Sie den X-API-Key Header hinzu');
});

test('authenticateApiKey rejects invalid keys with 403', async () => {
  const { auth } = loadAuth({
    serviceDocs: [{ key: 'valid-key', active: true }],
  });
  const req = { headers: { 'x-api-key': 'invalid' } };
  const res = createRes();
  let nextCalled = false;

  await auth.authenticateApiKey(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error, 'Ungültiger API-Key');
  assert.equal(
    res.body.message,
    'Der bereitgestellte API-Key ist ungültig oder inaktiv'
  );
});

test('authenticateApiKey forwards to next() when key is valid', async () => {
  const { auth } = loadAuth({
    serviceDocs: [{ key: 'valid-key', active: true }],
  });
  const req = { headers: { 'x-api-key': 'valid-key' } };
  const res = createRes();
  const nextCalls = [];

  await auth.authenticateApiKey(req, res, arg => {
    nextCalls.push(arg);
  });

  assert.equal(nextCalls.length, 1);
  assert.equal(nextCalls[0], undefined);
  assert.equal(res.statusCode, null);
  assert.equal(res.body, null);
});

test('authenticateApiKey passes errors from isValidApiKey to next', async () => {
  const { auth, serviceCollection } = loadAuth();
  const req = { headers: { 'x-api-key': 'anything' } };
  const res = createRes();
  const nextCalls = [];
  serviceCollection.find = () => {
    throw new Error('boom');
  };

  await auth.authenticateApiKey(req, res, err => {
    nextCalls.push(err);
  });

  assert.equal(nextCalls.length, 1);
  assert.equal(nextCalls[0].message, 'boom');
});

test('addApiKey upserts to Mongo and updates the in-memory cache', async () => {
  const { auth, serviceCollection } = loadAuth({
    serviceDocs: [{ key: 'existing', active: true }],
  });
  auth.apiKeysStore.loaded = true;
  auth.apiKeysStore.keys = [{ key: 'existing', active: true }];

  await auth.addApiKey({ key: 'new-key', active: false, owner: 'alice' });

  assert.equal(serviceCollection.calls.updateOne.length, 1);
  assert(serviceCollection.all.find(entry => entry.key === 'new-key'));
  const cached = auth.apiKeysStore.keys.find(entry => entry.key === 'new-key');
  assert.equal(cached.active, false);
  assert.equal(cached.owner, 'alice');
});

test('updateApiKey writes changes to Mongo and cache', async () => {
  const { auth, serviceCollection } = loadAuth({
    serviceDocs: [{ key: 'existing', active: true, note: 'old' }],
  });
  await auth.loadApiKeys();

  await auth.updateApiKey('existing', { active: false, note: 'updated' });

  assert.equal(serviceCollection.calls.updateOne.length, 1);
  const cached = auth.apiKeysStore.keys.find(entry => entry.key === 'existing');
  assert.equal(cached.active, false);
  assert.equal(cached.note, 'updated');
});

test('deleteApiKey removes entries from Mongo and cache', async () => {
  const { auth, serviceCollection } = loadAuth({
    serviceDocs: [
      { key: 'keep', active: true },
      { key: 'remove', active: true },
    ],
  });
  await auth.loadApiKeys();

  await auth.deleteApiKey('remove');

  assert.equal(serviceCollection.calls.deleteOne.length, 1);
  assert.equal(
    serviceCollection.all.find(entry => entry.key === 'remove'),
    undefined
  );
  assert.equal(
    auth.apiKeysStore.keys.find(entry => entry.key === 'remove'),
    undefined
  );
});

test('saveApiKeys syncs the cached keys back to Mongo', async () => {
  const { auth, serviceCollection } = loadAuth();
  auth.apiKeysStore.keys = [
    { key: 'alpha', active: true },
    { key: 'beta', active: false },
  ];

  await auth.saveApiKeys();

  assert.equal(serviceCollection.calls.updateOne.length, 2);
  assert.equal(
    serviceCollection.all.find(entry => entry.key === 'alpha').active,
    true
  );
  assert.equal(
    serviceCollection.all.find(entry => entry.key === 'beta').active,
    false
  );
});
