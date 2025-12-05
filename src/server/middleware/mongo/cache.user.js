// src/middleware/mongoUserCache.js
const { getMucajeyDb } = require('../../utils/client.mongo');

let db;
let User;

async function initUserCollection() {
  if (!db) {
    db = await getMucajeyDb();
    User = db.collection('user');
  }
}

function deepCopy(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/* --------------------------------------------------
 * USERS: LIST
 * -------------------------------------------------- */
async function listUsers() {
  await initUserCollection();
  const users = await User.find({}).project({ _id: 0 }).toArray();
  return deepCopy(users);
}

/* --------------------------------------------------
 * USERS: READ BY USERNAME
 * -------------------------------------------------- */
async function readUserByUsername(username) {
  await initUserCollection();
  const user = await User.findOne({ username });
  return deepCopy(user);
}

/* --------------------------------------------------
 * USERS: WRITE MANY (bulk upsert)
 * -------------------------------------------------- */
async function writeUsers(users) {
  await initUserCollection();

  if (!Array.isArray(users) || users.length === 0) {
    return [];
  }

  for (const user of users) {
    if (!user.username) {
      continue; // Benutzer ohne username überspringen
    }

    await User.updateOne(
      { username: user.username },
      { $set: user },
      { upsert: true }
    );
  }

  return listUsers();
}

/* --------------------------------------------------
 * USERS: WRITE ONE (upsert)
 * -------------------------------------------------- */
async function writeUser(user) {
  await initUserCollection();

  if (!user || !user.username) {
    throw new Error('User-Dokument benötigt ein Feld "username".');
  }

  await User.updateOne(
    { username: user.username },
    { $set: user },
    { upsert: true }
  );

  return readUserByUsername(user.username);
}

/* --------------------------------------------------
 * USERS: UPDATE FIELDS
 * -------------------------------------------------- */
async function updateUser(username, updatedFields) {
  await initUserCollection();

  await User.updateOne({ username }, { $set: updatedFields });

  return readUserByUsername(username);
}

/* --------------------------------------------------
 * USERS: DELETE SINGLE
 * -------------------------------------------------- */
async function deleteUser(username) {
  await initUserCollection();
  await User.deleteOne({ username });
}

/* --------------------------------------------------
 * USERS: DELETE ALL
 * -------------------------------------------------- */
async function deleteAllUsers() {
  await initUserCollection();
  await User.deleteMany({});
}

/* --------------------------------------------------
 * MIDDLEWARE
 * -------------------------------------------------- */
function userCacheMiddleware(req, res, next) {
  req.userCache = {
    getAll: () => listUsers(),
    getByUsername: username => readUserByUsername(username),
    writeMany: users => writeUsers(users),
    write: user => writeUser(user),
    update: (username, updated) => updateUser(username, updated),
    delete: username => deleteUser(username),
    deleteMany: () => deleteAllUsers(),
  };
  next();
}

module.exports = {
  initUserCollection,
  listUsers,
  readUserByUsername,
  writeUsers,
  writeUser,
  updateUser,
  deleteUser,
  deleteAllUsers,
  userCacheMiddleware,
};
