/* eslint-env jest */

const assert = require('node:assert/strict');

function deepCopy(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createMockCollection(initial = []) {
  const docs = initial;

  const matchFilter = (doc, filter = {}) => {
    return Object.entries(filter).every(([key, val]) => doc[key] === val);
  };

  return {
    find(filter = {}) {
      const result = docs.filter(doc => matchFilter(doc, filter));
      const cursor = {
        toArray: async () => deepCopy(result),
        project: () => cursor,
      };
      return cursor;
    },
    async findOne(filter = {}) {
      const found = docs.find(doc => matchFilter(doc, filter));
      return deepCopy(found || null);
    },
    async insertMany(entries) {
      docs.push(...entries.map(e => ({ ...e })));
    },
    async insertOne(entry) {
      docs.push({ ...entry });
      return { insertedId: entry._id || null };
    },
    async deleteMany(filter = {}) {
      let i = docs.length;
      while (i--) {
        if (matchFilter(docs[i], filter)) {
          docs.splice(i, 1);
        }
      }
    },
    async deleteOne(filter = {}) {
      const idx = docs.findIndex(doc => matchFilter(doc, filter));
      if (idx >= 0) {
        docs.splice(idx, 1);
      }
    },
    async updateOne(filter = {}, update = {}, options = {}) {
      const idx = docs.findIndex(doc => matchFilter(doc, filter));
      const set = update.$set || {};

      if (idx >= 0) {
        docs[idx] = { ...docs[idx], ...set };
      } else if (options.upsert) {
        docs.push({ ...filter, ...set });
      }
    },
    all: docs,
  };
}

let mockDataCollections = {};
let mockAuthCollections = {};

jest.mock('../../../server/utils/client.mongo.js', () => ({
  getMucajeyDataDb: async () => ({
    collection: name => {
      const col = mockDataCollections[name];
      if (!col) {
        throw new Error(`Collection not found: ${name}`);
      }
      return col;
    },
  }),
  getMucajeyDb: async () => ({
    collection: name => {
      const col = mockAuthCollections[name];
      if (!col) {
        throw new Error(`Collection not found: ${name}`);
      }
      return col;
    },
  }),
}));

function setMockClientMongo(dataDbCollections, authDbCollections) {
  mockDataCollections = dataDbCollections;
  mockAuthCollections = authDbCollections;
}

beforeEach(() => {
  mockDataCollections = {};
  mockAuthCollections = {};
});

test('cache.card supports list, write, update, delete via Mongo mock', async () => {
  const cardCollection = createMockCollection([
    { edition: 'hitster-classics', id: '1', title: 'Song A' },
    { edition: 'hitster-modern', id: '2', title: 'Song B' },
  ]);

  setMockClientMongo({ card: cardCollection }, {});
  let cardCache;
  jest.isolateModules(() => {
    cardCache = require('../../../server/middleware/mongo/cache.card');
  });

  const all = await cardCache.listCards();
  assert.equal(all.length, 2);

  const classics = await cardCache.readCardsByEdition('hitster-classics');
  assert.equal(classics.length, 1);

  await cardCache.writeCardForEdition('hitster-modern', {
    id: '3',
    title: 'Song C',
  });
  assert.equal(cardCollection.all.length, 3);

  await cardCache.updateCardByEdition('hitster-modern', '3', {
    title: 'Song C!',
  });
  const updated = cardCollection.all.find(c => c.id === '3');
  assert.equal(updated.title, 'Song C!');

  await cardCache.deleteCardByEdition('hitster-modern', '3');
  assert(!cardCollection.all.find(c => c.id === '3'));
});

test('cache.card writeCardsForEdition replaces edition set and returns new list', async () => {
  const cardCollection = createMockCollection([
    { edition: 'hitster-classics', id: '1', title: 'Old A' },
    { edition: 'other', id: '9', title: 'Keep' },
  ]);

  setMockClientMongo({ card: cardCollection }, {});
  let cardCache;
  jest.isolateModules(() => {
    cardCache = require('../../../server/middleware/mongo/cache.card');
  });

  const result = await cardCache.writeCardsForEdition('hitster-classics', [
    { id: '2', title: 'New A' },
    { id: '3', title: 'New B' },
  ]);

  const classics = cardCollection.all.filter(
    c => c.edition === 'hitster-classics'
  );
  assert.equal(classics.length, 2);
  assert.equal(classics[0].id, '2');
  assert.equal(result.length, 2);
  assert.equal(cardCollection.all.find(c => c.id === '9').title, 'Keep');
});

test('cache.card updateCardByEdition returns undefined when the card does not exist', async () => {
  const cardCollection = createMockCollection([
    { edition: 'hitster-classics', id: '1', title: 'Song A' },
  ]);

  setMockClientMongo({ card: cardCollection }, {});
  let cardCache;
  jest.isolateModules(() => {
    cardCache = require('../../../server/middleware/mongo/cache.card');
  });

  const updated = await cardCache.updateCardByEdition(
    'hitster-classics',
    '999',
    { title: 'X' }
  );
  assert.equal(updated, null);
});

test('cache.card deleteCardsForEdition removes all cards for that edition', async () => {
  const cardCollection = createMockCollection([
    { edition: 'hitster-classics', id: '1', title: 'Song A' },
    { edition: 'hitster-classics', id: '2', title: 'Song B' },
    { edition: 'other', id: '3', title: 'Song C' },
  ]);

  setMockClientMongo({ card: cardCollection }, {});
  let cardCache;
  jest.isolateModules(() => {
    cardCache = require('../../../server/middleware/mongo/cache.card');
  });

  await cardCache.deleteCardsForEdition('hitster-classics');
  assert.equal(
    cardCollection.all.filter(c => c.edition === 'hitster-classics').length,
    0
  );
  assert.equal(cardCollection.all.find(c => c.id === '3').title, 'Song C');
});

test('cache.edition supports list, read, write, delete via Mongo mock', async () => {
  const editionCollection = createMockCollection([
    { edition: 'hitster-classics', edition_name: 'Classics' },
  ]);

  setMockClientMongo({ edition: editionCollection }, {});
  let editionCache;
  jest.isolateModules(() => {
    editionCache = require('../../../server/middleware/mongo/cache.edition');
  });

  const list = await editionCache.listEditions();
  assert.deepEqual(list, ['hitster-classics.json']);

  const read = await editionCache.readEdition('hitster-classics.json');
  assert.equal(read.edition_name, 'Classics');

  await editionCache.writeEdition('hitster-modern.json', {
    edition: 'hitster-modern',
  });
  assert(editionCollection.all.find(e => e.edition === 'hitster-modern'));

  await editionCache.deleteEdition('hitster-modern.json');
  assert(!editionCollection.all.find(e => e.edition === 'hitster-modern'));
});

test('cache.service supports write, read, delete via Mongo mock', async () => {
  const serviceCollection = createMockCollection([
    { key: 'existing', active: true },
  ]);

  setMockClientMongo({}, { service: serviceCollection });
  let serviceCache;
  jest.isolateModules(() => {
    serviceCache = require('../../../server/middleware/mongo/cache.service');
  });

  const all = await serviceCache.listServices();
  assert.equal(all.length, 1);

  await serviceCache.writeService({ key: 'new', active: true });
  assert(serviceCollection.all.find(s => s.key === 'new'));

  await serviceCache.updateServiceByKey('new', { active: false });
  assert.equal(serviceCollection.all.find(s => s.key === 'new').active, false);

  await serviceCache.deleteServiceByKey('new');
  assert(!serviceCollection.all.find(s => s.key === 'new'));
});

test('cache.service writeServices upserts many, skips missing keys, returns list', async () => {
  const serviceCollection = createMockCollection([]);
  setMockClientMongo({}, { service: serviceCollection });
  let serviceCache;
  jest.isolateModules(() => {
    serviceCache = require('../../../server/middleware/mongo/cache.service');
  });

  const list = await serviceCache.writeServices([
    { key: 'a', active: true },
    { active: false }, // missing key should be skipped
    { key: 'b', active: false },
  ]);

  assert.equal(serviceCollection.all.length, 2);
  assert.equal(list.length, 2);
  assert(serviceCollection.all.find(s => s.key === 'a'));
  assert(serviceCollection.all.find(s => s.key === 'b'));
});

test('cache.service writeServices returns empty array when given none', async () => {
  const serviceCollection = createMockCollection([
    { key: 'existing', active: true },
  ]);
  setMockClientMongo({}, { service: serviceCollection });
  let serviceCache;
  jest.isolateModules(() => {
    serviceCache = require('../../../server/middleware/mongo/cache.service');
  });

  const result = await serviceCache.writeServices([]);
  assert.deepEqual(result, []);
  // collection untouched
  assert.equal(serviceCollection.all.length, 1);
});

test('cache.service writeService throws without key', async () => {
  const serviceCollection = createMockCollection([]);
  setMockClientMongo({}, { service: serviceCollection });
  let serviceCache;
  jest.isolateModules(() => {
    serviceCache = require('../../../server/middleware/mongo/cache.service');
  });

  await assert.rejects(
    () => serviceCache.writeService({ active: true }),
    /Service-Dokument mit "key" wird benötigt/
  );
});

test('cache.service deleteAllServices clears collection', async () => {
  const serviceCollection = createMockCollection([{ key: 'a' }, { key: 'b' }]);
  setMockClientMongo({}, { service: serviceCollection });
  let serviceCache;
  jest.isolateModules(() => {
    serviceCache = require('../../../server/middleware/mongo/cache.service');
  });

  await serviceCache.deleteAllServices();
  assert.equal(serviceCollection.all.length, 0);
});

test('serviceCacheMiddleware attaches helpers and delegates to service cache', async () => {
  const serviceCollection = createMockCollection([]);
  setMockClientMongo({}, { service: serviceCollection });
  jest.resetModules();
  const serviceCache = require('../../../server/middleware/mongo/cache.service');

  const req = {};
  const next = jest.fn();
  serviceCache.serviceCacheMiddleware(req, {}, next);

  const [all, byKey, wrote, wroteMany] = await Promise.all([
    req.serviceCache.getAll(),
    req.serviceCache.getByKey('x'),
    req.serviceCache.write({ key: 'a', active: true }),
    req.serviceCache.writeMany([{ key: 'a' }]),
  ]);
  assert.equal(serviceCollection.all.length, 1);
  assert.equal(serviceCollection.all[0].key, 'a');
  assert.equal(serviceCollection.all[0].active, true);

  await req.serviceCache.delete('a');
  await req.serviceCache.deleteMany();
  await req.serviceCache.update('a', { active: false });

  assert.deepEqual(all, []);
  assert.equal(byKey, null);
  assert(wrote);
  assert(Array.isArray(wroteMany));
  assert.equal(serviceCollection.all.length, 0);
  expect(next).toHaveBeenCalledTimes(1);
});

test('cache.user supports write, read, delete via Mongo mock', async () => {
  const userCollection = createMockCollection([
    { username: 'alice', role: 'admin' },
  ]);

  setMockClientMongo({}, { user: userCollection });
  let userCache;
  jest.isolateModules(() => {
    userCache = require('../../../server/middleware/mongo/cache.user');
  });

  const list = await userCache.listUsers();
  assert.equal(list.length, 1);

  await userCache.writeUser({ username: 'bob', role: 'editor' });
  assert(userCollection.all.find(u => u.username === 'bob'));

  await userCache.updateUser('bob', { role: 'owner' });
  assert.equal(
    userCollection.all.find(u => u.username === 'bob').role,
    'owner'
  );

  await userCache.deleteUser('bob');
  assert(!userCollection.all.find(u => u.username === 'bob'));
});

test('cache.user writeUsers bulk-upserts and skips entries without username', async () => {
  const userCollection = createMockCollection([]);
  setMockClientMongo({}, { user: userCollection });
  let userCache;
  jest.isolateModules(() => {
    userCache = require('../../../server/middleware/mongo/cache.user');
  });

  const result = await userCache.writeUsers([
    { username: 'alice', role: 'admin' },
    { role: 'skip-me' }, // missing username should be ignored
    { username: 'bob', role: 'user' },
  ]);

  assert.equal(userCollection.all.length, 2);
  assert.equal(result.length, 2);
  assert(userCollection.all.find(u => u.username === 'alice'));
  assert(userCollection.all.find(u => u.username === 'bob'));
});

test('cache.user writeUsers returns empty array when given no users', async () => {
  const userCollection = createMockCollection([{ username: 'existing' }]);
  setMockClientMongo({}, { user: userCollection });
  let userCache;
  jest.isolateModules(() => {
    userCache = require('../../../server/middleware/mongo/cache.user');
  });

  const result = await userCache.writeUsers([]);
  assert.deepEqual(result, []);
  assert.equal(userCollection.all.length, 1);
});

test('cache.user writeUser throws when username is missing', async () => {
  const userCollection = createMockCollection([]);
  setMockClientMongo({}, { user: userCollection });
  let userCache;
  jest.isolateModules(() => {
    userCache = require('../../../server/middleware/mongo/cache.user');
  });

  await assert.rejects(
    () => userCache.writeUser({ role: 'admin' }),
    /User-Dokument benötigt ein Feld "username"/
  );
});

test('cache.user deleteAllUsers removes every document', async () => {
  const userCollection = createMockCollection([
    { username: 'alice' },
    { username: 'bob' },
  ]);
  setMockClientMongo({}, { user: userCollection });
  let userCache;
  jest.isolateModules(() => {
    userCache = require('../../../server/middleware/mongo/cache.user');
  });

  await userCache.deleteAllUsers();
  assert.equal(userCollection.all.length, 0);
});

test('userCacheMiddleware attaches helpers and calls next', async () => {
  setMockClientMongo({}, { user: createMockCollection([]) });
  let userCache;
  jest.isolateModules(() => {
    userCache = require('../../../server/middleware/mongo/cache.user');
  });

  const req = {};
  const next = jest.fn();
  userCache.userCacheMiddleware(req, {}, next);

  expect(typeof req.userCache.getAll).toBe('function');
  await req.userCache.getAll();
  expect(next).toHaveBeenCalledTimes(1);
});

test('cardCacheMiddleware attaches cache helpers and calls next', async () => {
  setMockClientMongo({ card: createMockCollection([]) }, {});
  let cardCache;
  jest.isolateModules(() => {
    cardCache = require('../../../server/middleware/mongo/cache.card');
  });

  const req = {};
  const next = jest.fn();
  cardCache.cardCacheMiddleware(req, {}, next);

  expect(typeof req.cardsCache.getAll).toBe('function');
  await req.cardsCache.getAll();
  expect(next).toHaveBeenCalledTimes(1);
});
