/* eslint-env jest */

const assert = require('node:assert/strict');

const cardModule = require('../../../server/routes/v2/card');
const { normalizeEditionInput, buildEditionMetaMap, normalizeCardForResponse } =
  cardModule._test;

function createReq(overrides = {}) {
  return {
    editionsCache: {
      async getAll() {
        return [];
      },
      async get() {
        return null;
      },
      ...overrides.editionsCache,
    },
  };
}

test('normalizeEditionInput handles edition_file, edition, and empty inputs', () => {
  const fromFile = normalizeEditionInput(undefined, '/some/path/custom.json');
  assert.deepEqual(fromFile, {
    editionId: 'custom',
    editionFile: 'custom.json',
  });

  const fromEdition = normalizeEditionInput('my-edition');
  assert.deepEqual(fromEdition, {
    editionId: 'my-edition',
    editionFile: 'my-edition.json',
  });

  const none = normalizeEditionInput();
  assert.deepEqual(none, { editionId: null, editionFile: null });
});

test('buildEditionMetaMap returns empty map on cache errors or non-array results', async () => {
  const errReq = createReq({
    editionsCache: {
      async getAll() {
        throw new Error('boom');
      },
      async get() {
        return null;
      },
    },
  });
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  const map1 = await buildEditionMetaMap(errReq);
  errorSpy.mockRestore();
  assert.equal(map1.size, 0);

  const nonArrayReq = createReq({
    editionsCache: {
      async getAll() {
        return null;
      },
      async get() {
        return null;
      },
    },
  });
  const map2 = await buildEditionMetaMap(nonArrayReq);
  assert.equal(map2.size, 0);
});

test('buildEditionMetaMap skips missing editions and logs load errors', async () => {
  const editionsCache = {
    async getAll() {
      return ['a.json', 'b.json', 'c.json'];
    },
    async get(filename) {
      if (filename === 'a.json') return { edition: 'a', edition_name: 'A' };
      if (filename === 'b.json') return null; // skipped
      if (filename === 'c.json') throw new Error('fail'); // logged
      return null;
    },
  };
  const req = createReq({ editionsCache });
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  const map = await buildEditionMetaMap(req);
  errorSpy.mockRestore();

  assert.equal(map.size, 1);
  assert.deepEqual(map.get('a'), { edition_file: 'a.json', edition_name: 'A' });
});

test('normalizeCardForResponse returns null/undefined unchanged and strips _id', () => {
  assert.equal(normalizeCardForResponse(null), null);
  const card = { _id: '123', id: '1', edition: 'foo', title: 'Song' };
  const normalized = normalizeCardForResponse(card, new Map());
  assert(!('_id' in normalized));
  assert.equal(normalized.edition, 'foo');
});
