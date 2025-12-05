const { HeaderAPIKeyStrategy } = require('passport-headerapikey');
const { isValidApiKey } = require('../mucajey/auth');

function apiKeyStrategy() {
  return new HeaderAPIKeyStrategy(
    { header: 'X-API-Key', prefix: '' },
    false,
    async (apiKey, done) => {
      try {
        const valid = await isValidApiKey(apiKey);
        if (!valid) {
          return done(null, false);
        }
        return done(null, { apiKey });
      } catch (error) {
        return done(error);
      }
    }
  );
}

module.exports = {
  apiKeyStrategy,
};
