/* eslint-env jest */

const assert = require('node:assert/strict');

function deepCopy(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/**
 * Minimal Mongo-like filter matcher.
 * Supports:
 * - plain equality filters { a: 1, b: "x" }
 * - $or: [ {...}, {...} ]
 */
const matchFilter = (doc, filter = {}) => {
  if (!filter || typeof filter !== 'object') return true;

  // If $or is present: require ($or matches) AND (all other keys match)
  if (Array.isArray(filter.$or)) {
    const orMatches = filter.$or.some(sub => matchFilter(doc, sub));

    const { $or: _ignored, ...rest } = filter;
    void _ignored;

    const restMatches = Object.entries(rest).every(
      ([key, val]) => doc[key] === val
    );

    return orMatches && restMatches;
  }

  // Plain equality
  return Object.entries(filter).every(([key, val]) => doc[key] === val);
};

function createMockCollection(initial = []) {
  const docs = initial;

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
        if (matchFilter(docs[i], filter)) docs.splice(i, 1);
      }
    },
    async deleteOne(filter = {}) {
      const idx = docs.findIndex(doc => matchFilter(doc, filter));
      if (idx >= 0) docs.splice(idx, 1);
    },
    async updateOne(filter = {}, update = {}, options = {}) {
      const idx = docs.findIndex(doc => matchFilter(doc, filter));
      const set = update.$set || {};

      if (idx >= 0) {
        docs[idx] = { ...docs[idx], ...set };
      } else if (options.upsert) {
        // mimic upsert: insert merged doc
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
      if (!col) throw new Error(`Collection not found: ${name}`);
      return col;
    },
  }),
  getMucajeyDb: async () => ({
    collection: name => {
      const col = mockAuthCollections[name];
      if (!col) throw new Error(`Collection not found: ${name}`);
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

describe('mongo cache middleware (refactored edition_id semantics)', () => {
  test('cache.card supports list, write, update, delete via Mongo mock', async () => {
    const cardCollection = createMockCollection([
      // legacy-only doc (edition)
      { edition: 'hitster-de-classics', id: '1', title: 'Song A' },
      // new doc (edition_id + edition alias)
      {
        edition_id: 'hitster-de-modern',
        edition: 'hitster-de-modern',
        id: '2',
        title: 'Song B',
      },
    ]);

    setMockClientMongo({ card: cardCollection }, {});
    let cardCache;
    jest.isolateModules(() => {
      cardCache = require('../../../server/middleware/mongo/cache.card');
    });

    const all = await cardCache.listCards();
    assert.equal(all.length, 2);

    // should match legacy doc via $or (edition_id OR edition)
    const classics = await cardCache.readCardsByEdition('hitster-de-classics');
    assert.equal(classics.length, 1);

    await cardCache.writeCardForEdition('hitster-de-modern', {
      id: '3',
      title: 'Song C',
    });
    assert.equal(cardCollection.all.length, 3);

    // invariant: newly written doc must have both fields
    const inserted = cardCollection.all.find(c => c.id === '3');
    assert.equal(inserted.edition_id, 'hitster-de-modern');
    assert.equal(inserted.edition, 'hitster-de-modern');

    await cardCache.updateCardByEdition('hitster-de-modern', '3', {
      title: 'Song C!',
    });

    const updated = cardCollection.all.find(c => c.id === '3');
    assert.equal(updated.title, 'Song C!');

    await cardCache.deleteCardByEdition('hitster-de-modern', '3');
    assert(!cardCollection.all.find(c => c.id === '3'));
  });

  test('cache.card writeCardsForEdition replaces edition set and returns new list', async () => {
    const cardCollection = createMockCollection([
      { edition: 'hitster-de-classics', id: '1', title: 'Old A' },
      {
        edition_id: 'hitster-de-other',
        edition: 'hitster-de-other',
        id: '9',
        title: 'Keep',
      },
    ]);

    setMockClientMongo({ card: cardCollection }, {});
    let cardCache;
    jest.isolateModules(() => {
      cardCache = require('../../../server/middleware/mongo/cache.card');
    });

    const result = await cardCache.writeCardsForEdition('hitster-de-classics', [
      { id: '2', title: 'New A' },
      { id: '3', title: 'New B' },
    ]);

    const classics = cardCollection.all.filter(
      c =>
        c.edition_id === 'hitster-de-classics' ||
        c.edition === 'hitster-de-classics'
    );

    // old classics deleted, two new inserted
    assert.equal(classics.length, 2);
    assert.equal(result.length, 2);

    // ensure alias fields exist on inserted docs
    const c2 = cardCollection.all.find(c => c.id === '2');
    const c3 = cardCollection.all.find(c => c.id === '3');
    assert.equal(c2.edition_id, 'hitster-de-classics');
    assert.equal(c2.edition, 'hitster-de-classics');
    assert.equal(c3.edition_id, 'hitster-de-classics');
    assert.equal(c3.edition, 'hitster-de-classics');

    // other edition remains
    assert.equal(cardCollection.all.find(c => c.id === '9').title, 'Keep');
  });

  test('cache.card updateCardByEdition returns null when the card does not exist', async () => {
    const cardCollection = createMockCollection([
      {
        edition_id: 'hitster-de-classics',
        edition: 'hitster-de-classics',
        id: '1',
        title: 'Song A',
      },
    ]);

    setMockClientMongo({ card: cardCollection }, {});
    let cardCache;
    jest.isolateModules(() => {
      cardCache = require('../../../server/middleware/mongo/cache.card');
    });

    const updated = await cardCache.updateCardByEdition(
      'hitster-de-classics',
      '999',
      { title: 'X' }
    );
    assert.equal(updated, null);
  });

  test('cache.card deleteCardsForEdition removes all cards for that edition', async () => {
    const cardCollection = createMockCollection([
      { edition: 'hitster-de-classics', id: '1', title: 'Song A' }, // legacy
      {
        edition_id: 'hitster-de-classics',
        edition: 'hitster-de-classics',
        id: '2',
        title: 'Song B',
      },
      { edition_id: 'other', edition: 'other', id: '3', title: 'Song C' },
    ]);

    setMockClientMongo({ card: cardCollection }, {});
    let cardCache;
    jest.isolateModules(() => {
      cardCache = require('../../../server/middleware/mongo/cache.card');
    });

    await cardCache.deleteCardsForEdition('hitster-de-classics');

    assert.equal(
      cardCollection.all.filter(
        c =>
          c.edition === 'hitster-de-classics' ||
          c.edition_id === 'hitster-de-classics'
      ).length,
      0
    );

    assert.equal(cardCollection.all.find(c => c.id === '3').title, 'Song C');
  });

  test('cache.edition supports list, read, write, delete via Mongo mock', async () => {
    const editionCollection = createMockCollection([
      // existing edition in canonical form
      {
        edition_id: 'hitster-de-classics',
        edition: 'hitster-de-classics',
        edition_name: 'Classics',
      },
      // legacy-only (optional) to validate list fallback:
      { edition: 'hitster-de-legacy', edition_name: 'Legacy' },
    ]);

    setMockClientMongo({ edition: editionCollection }, {});
    let editionCache;
    jest.isolateModules(() => {
      editionCache = require('../../../server/middleware/mongo/cache.edition');
    });

    const list = await editionCache.listEditions();
    // order not guaranteed; assert as set
    assert.deepEqual(
      new Set(list),
      new Set(['hitster-de-classics', 'hitster-de-legacy'])
    );

    const read = await editionCache.readEdition('hitster-de-classics');
    assert.equal(read.edition_name, 'Classics');
    assert.equal(read.edition_id, 'hitster-de-classics');
    assert.equal(read.edition, 'hitster-de-classics');

    await editionCache.writeEdition('hitster-de-modern', {
      edition_name: 'Modern',
      language_short: 'en',
    });

    const modern = editionCollection.all.find(
      e => e.edition_id === 'hitster-de-modern'
    );
    assert(modern, 'expected modern edition to be written');
    assert.equal(modern.edition, 'hitster-de-modern'); // alias

    await editionCache.deleteEdition('hitster-de-modern');
    assert(
      !editionCollection.all.find(e => e.edition_id === 'hitster-de-modern')
    );
    assert(!editionCollection.all.find(e => e.edition === 'hitster-de-modern'));
  });

  // ---- service cache tests unchanged (already keyed by "key") ----

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
    assert.equal(
      serviceCollection.all.find(s => s.key === 'new').active,
      false
    );

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
    const serviceCollection = createMockCollection([
      { key: 'a' },
      { key: 'b' },
    ]);
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

  // ---- user cache tests unchanged (already keyed by "username") ----

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
      { role: 'skip-me' },
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
});
