const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs');
const { getMucajeyDb } = require('../../utils/client.mongo.js'); // Pfad ggf. anpassen

async function findUserByUsername(username) {
  const db = await getMucajeyDb();
  const collection = db.collection('user');
  return collection.findOne({ username });
}

function localStrategy() {
  return new LocalStrategy(async (username, password, done) => {
    try {
      // 1) User aus Mongo holen
      const user = await findUserByUsername(username);
      if (!user) {
        return done(null, false, { message: 'Invalid username or password' });
      }

      // 2) Passwort prüfen
      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        return done(null, false, { message: 'Invalid username or password' });
      }

      // 3) API-Key auswählen:
      //    - bevorzugt user.apiKey (Legacy)
      //    - sonst erstes apikeys[]-Element, falls vorhanden
      let apiKey = user.apiKey;
      if (
        (!apiKey || apiKey.length === 0) &&
        Array.isArray(user.apikeys) &&
        user.apikeys.length > 0
      ) {
        apiKey = user.apikeys[0]?.key ?? '';
      }

      // 4) Für Passport das „flache“ User-Objekt zurückgeben
      return done(null, {
        username: user.username,
        type: user.type || 'user',
        apiKey,
      });
    } catch (error) {
      done(error);
    }
  });
}

module.exports = {
  localStrategy,
};
