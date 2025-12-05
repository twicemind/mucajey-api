/* eslint-env jest */

const assert = require('node:assert/strict');

let mockDb;
jest.mock('../../../server/utils/client.mongo.js', () => ({
  getMucajeyDb: async () => mockDb,
}));

jest.mock(
  'passport-local',
  () => ({
    Strategy: function LocalStrategy(verify) {
      this._verify = verify;
    },
  }),
  { virtual: true }
);

jest.mock('bcryptjs', () => ({
  compare: (...args) => mockBcryptCompare(...args),
}));

let mockBcryptCompare;
const {
  localStrategy,
} = require('../../../server/middleware/passport/strategy.local');

function createStrategy() {
  const strategy = localStrategy();
  return (
    strategy._verify ||
    strategy.verify ||
    strategy._fn ||
    strategy._callback ||
    strategy
  );
}

test('localStrategy rejects when user not found', async () => {
  mockDb = {
    collection: () => ({
      findOne: async () => null,
    }),
  };
  mockBcryptCompare = jest.fn();

  const verify = createStrategy();
  const done = jest.fn();
  await verify('alice', 'pw', done);

  assert.equal(done.mock.calls[0][0], null);
  assert.equal(done.mock.calls[0][1], false);
  assert.match(done.mock.calls[0][2].message, /Invalid username or password/);
});

test('localStrategy rejects when password invalid', async () => {
  mockDb = {
    collection: () => ({
      findOne: async () => ({ username: 'alice', password: 'hash' }),
    }),
  };
  mockBcryptCompare = jest.fn(async () => false);

  const verify = createStrategy();
  const done = jest.fn();
  await verify('alice', 'pw', done);

  assert.equal(done.mock.calls[0][0], null);
  assert.equal(done.mock.calls[0][1], false);
  assert.match(done.mock.calls[0][2].message, /Invalid username or password/);
});

test('localStrategy returns flattened user with legacy apiKey or apikeys array', async () => {
  mockDb = {
    collection: () => ({
      findOne: async () => ({
        username: 'alice',
        password: 'hash',
        apikeys: [{ key: 'k1' }],
        type: 'admin',
      }),
    }),
  };
  mockBcryptCompare = jest.fn(async () => true);

  const verify = createStrategy();
  const done = jest.fn();
  await verify('alice', 'pw', done);

  assert.equal(done.mock.calls[0][0], null);
  assert.equal(done.mock.calls[0][1].username, 'alice');
  assert.equal(done.mock.calls[0][1].apiKey, 'k1');
  assert.equal(done.mock.calls[0][1].type, 'admin');
});

test('localStrategy forwards errors', async () => {
  mockDb = {
    collection: () => ({
      findOne: async () => {
        throw new Error('boom');
      },
    }),
  };
  mockBcryptCompare = jest.fn(async () => true);

  const verify = createStrategy();
  const done = jest.fn();
  await verify('alice', 'pw', done);

  assert.equal(done.mock.calls[0][0].message, 'boom');
});
