const { MongoClient } = require('mongodb');
require('dotenv').config();

function buildUri({ host, user, pass, authSource }) {
  if (!host || !user || !pass) {
    throw new Error(
      '[MongoConfig] Host/User/Pass sind nicht vollständig gesetzt'
    );
  }

  const encUser = encodeURIComponent(user);
  const encPass = encodeURIComponent(pass);

  const authSourceParam = authSource
    ? `?authSource=${encodeURIComponent(authSource)}`
    : '';

  return `mongodb://${encUser}:${encPass}@${host}/${authSourceParam}`;
}

const host = process.env.MONGODB_HOST || 'localhost:27017';

/* ---- mucajey (user/api) ---- */
const mucajeyConfig = {
  uri:
    process.env.MONGODB_MUCAJEY_URI ||
    buildUri({
      host,
      user: process.env.MONGODB_MUCAJEY_USER,
      pass: process.env.MONGODB_MUCAJEY_PASS,
      authSource: process.env.MONGODB_MUCAJEY_AUTH_SOURCE || 'admin',
    }),
  dbName: process.env.MONGODB_MUCAJEY_DB || 'mucajey',
};

/* ---- mucajey-data (edition/card) ---- */
const mucajeyDataConfig = {
  uri:
    process.env.MONGODB_MUCAJEYDATA_URI ||
    buildUri({
      host,
      user: process.env.MONGODB_MUCAJEYDATA_USER,
      pass: process.env.MONGODB_MUCAJEYDATA_PASS,
      authSource: process.env.MONGODB_MUCAJEYDATA_AUTH_SOURCE || 'admin',
    }),
  dbName: process.env.MONGODB_MUCAJEYDATA_DB || 'mucajey-data',
};

let clientMucajey;
let clientMucajeyData;

async function getMucajeyDb() {
  if (!clientMucajey) {
    clientMucajey = new MongoClient(mucajeyConfig.uri);
    await clientMucajey.connect();
    console.log('[Mongo] Connected (mucajey)');
  }
  return clientMucajey.db(mucajeyConfig.dbName);
}

async function getMucajeyDataDb() {
  if (!clientMucajeyData) {
    clientMucajeyData = new MongoClient(mucajeyDataConfig.uri);
    await clientMucajeyData.connect();
    console.log('[Mongo] Connected (mucajey-data)');
  }
  return clientMucajeyData.db(mucajeyDataConfig.dbName);
}

module.exports = {
  getMucajeyDb,
  getMucajeyDataDb,
};
