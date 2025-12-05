// src/middleware/mongoServiceCache.js
const { getMucajeyDb } = require('../../utils/client.mongo');

let db;
let Service;

async function initServiceCollection() {
  if (!db) {
    db = await getMucajeyDb();
    Service = db.collection('service');
  }
}

function deepCopy(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/* ---- Service: Liste aller Einträge ---- */
async function listServices() {
  await initServiceCollection();
  const docs = await Service.find({}).toArray();
  return deepCopy(docs);
}

/* ---- Service: Einzelnen Eintrag per key lesen ---- */
async function readServiceByKey(key) {
  await initServiceCollection();
  const doc = await Service.findOne({ key });
  return deepCopy(doc);
}

/* ---- Service: Viele Einträge schreiben (upsert) ---- */
async function writeServices(services) {
  await initServiceCollection();

  if (!Array.isArray(services) || services.length === 0) {
    return [];
  }

  for (const service of services) {
    if (!service.key) {
      // key ist Pflicht – ohne überspringen wir
      // du kannst hier auch throwen, wenn du es strikter willst
      continue;
    }

    await Service.updateOne(
      { key: service.key },
      { $set: service },
      { upsert: true }
    );
  }

  return listServices();
}

/* ---- Service: Einen Eintrag schreiben (upsert) ---- */
async function writeService(service) {
  await initServiceCollection();

  if (!service || !service.key) {
    throw new Error('Service-Dokument mit "key" wird benötigt');
  }

  await Service.updateOne(
    { key: service.key },
    { $set: service },
    { upsert: true }
  );

  return readServiceByKey(service.key);
}

/* ---- Service: Einen Eintrag löschen ---- */
async function deleteServiceByKey(key) {
  await initServiceCollection();
  await Service.deleteOne({ key });
}

/* ---- Service: Alle Einträge löschen (optional) ---- */
async function deleteAllServices() {
  await initServiceCollection();
  await Service.deleteMany({});
}

/* ---- Service: Einen Eintrag updaten ---- */
async function updateServiceByKey(key, updatedFields) {
  await initServiceCollection();

  await Service.updateOne({ key }, { $set: updatedFields });

  return readServiceByKey(key);
}

/* ---- Middleware: in req.serviceCache einhängen ---- */
function serviceCacheMiddleware(req, res, next) {
  req.serviceCache = {
    getAll: () => listServices(),
    getByKey: key => readServiceByKey(key),
    writeMany: services => writeServices(services),
    write: service => writeService(service),
    delete: key => deleteServiceByKey(key),
    deleteMany: () => deleteAllServices(),
    update: (key, updatedFields) => updateServiceByKey(key, updatedFields),
  };
  next();
}

module.exports = {
  initServiceCollection,
  listServices,
  readServiceByKey,
  writeServices,
  writeService,
  deleteServiceByKey,
  deleteAllServices,
  updateServiceByKey,
  serviceCacheMiddleware,
};
