const path = require('path');

async function resolveEdition(req, edition_id) {
  if (!edition_id) {
    return null;
  }

  const editions = await req.editionsCache.getAll();
  const exactMatch = editions.find(id => id === edition_id);
  if (exactMatch) {
    return exactMatch;
  }

  return null;
}

function getBaseUrl(req) {
  const proto = (req.headers['x-forwarded-proto'] || req.protocol)
    .split(',')[0]
    .trim();
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${proto}://${host}`;
}

function getEditionImageFilename(edition_id) {
  return `${edition_id}.png`;
}

function getEditionImagePath(edition_id) {
  return path.resolve(
    process.cwd(),
    'images',
    getEditionImageFilename(edition_id)
  );
}

module.exports = {
  resolveEdition,
  getBaseUrl,
  getEditionImageFilename,
  getEditionImagePath,
};
