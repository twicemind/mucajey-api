/* eslint-env jest */

const assert = require('node:assert/strict');

jest.mock('mongodb', () => ({
  MongoClient: function MockClient(uri) {
    this.uri = uri;
    this.connect = jest.fn(async () => {});
    this.db = jest.fn(name => ({ name }));
  },
}));

jest.mock('dotenv', () => ({
  config: jest.fn(),
}));

const originalEnv = { ...process.env };

function setEnvForMongo() {
  process.env.MONGODB_HOST = process.env.MONGODB_HOST || 'localhost:27017';
  process.env.MONGODB_MUCAJEY_USER =
    process.env.MONGODB_MUCAJEY_USER || 'user1';
  process.env.MONGODB_MUCAJEY_PASS =
    process.env.MONGODB_MUCAJEY_PASS || 'pass1';
  process.env.MONGODB_MUCAJEYDATA_USER =
    process.env.MONGODB_MUCAJEYDATA_USER || 'user2';
  process.env.MONGODB_MUCAJEYDATA_PASS =
    process.env.MONGODB_MUCAJEYDATA_PASS || 'pass2';
}

afterEach(() => {
  Object.assign(process.env, originalEnv);
  jest.resetModules();
});

function loadClientMongo() {
  setEnvForMongo();
  jest.resetModules();
  return require('../../server/utils/client.mongo');
}

test('builds and reuses mucajey client with defaults', async () => {
  const clientMongo = loadClientMongo();
  const db1 = await clientMongo.getMucajeyDb();
  const db2 = await clientMongo.getMucajeyDb();

  assert.equal(db1.name, process.env.MONGODB_MUCAJEY_DB || 'mucajey');
  assert.equal(db2.name, process.env.MONGODB_MUCAJEY_DB || 'mucajey');
});

test('builds and reuses mucajey-data client with defaults', async () => {
  const clientMongo = loadClientMongo();
  const db1 = await clientMongo.getMucajeyDataDb();
  const db2 = await clientMongo.getMucajeyDataDb();

  assert.equal(db1.name, process.env.MONGODB_MUCAJEYDATA_DB || 'mucajey-data');
  assert.equal(db2.name, process.env.MONGODB_MUCAJEYDATA_DB || 'mucajey-data');
});

test('throws when required config is missing for buildUri at module init', () => {
  jest.resetModules();
  delete process.env.MONGODB_MUCAJEY_USER;
  delete process.env.MONGODB_MUCAJEY_PASS;

  expect(() => {
    require('../../server/utils/client.mongo');
  }).toThrow('[MongoConfig]');
});
