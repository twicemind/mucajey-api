const express = require('express');
const path = require('path');
const {
  documentation: documentEndpoint,
  message: createMessage,
  error: createError,
} = require('../../utils/result');

const router = express.Router();

async function resolveEditionFilename(req, edition) {
  if (!edition) {
    return null;
  }

  const cleaned = path.basename(edition);
  const rawEdition = cleaned.endsWith('.json') ? cleaned : `${cleaned}.json`;

  const files = await req.dataCache.listFiles(); // ⬅️ jetzt async

  const exactMatch = files.find(file => file === rawEdition);
  if (exactMatch) {
    return exactMatch;
  }

  const candidateByBase = files.find(
    file => path.basename(file, '.json') === cleaned
  );
  if (candidateByBase) {
    return candidateByBase;
  }

  const candidateByLower = files.find(
    file =>
      path.basename(file, '.json').toLowerCase() === cleaned.toLowerCase()
  );
  if (candidateByLower) {
    return candidateByLower;
  }

  return null;
}

router.get('/', async (req, res) => {
  const doc = documentEndpoint({
    method: 'GET',
    path: '/edition/',
    description: 'Explains how to create a new card edition file inside the data store.'
  });
  const message = createMessage({
    docs: doc,
    message: 'Edition helper endpoint is ready.',
    notes: 'Provide either `edition` or `edition_file` plus optional metadata when creating a new file.'
  });
  res.json(message);
});

router.get('/all', async (req, res) => {
  const doc = documentEndpoint({
    method: 'GET',
    path: '/edition/all',
    description: 'List every edition file along with metadata that is currently cached in memory.'
  });

  // ⬇️ async: Files holen
  const files = await req.dataCache.listFiles();

  // ⬇️ async: pro File readFile aufrufen
  const editions = await Promise.all(
    files.map(async filename => {
      const fileData = (await req.dataCache.readFile(filename)) || {};
      const editionIdentifier =
        fileData.edition || path.basename(filename, '.json');

      return {
        edition: editionIdentifier,
        edition_name: fileData.edition_name || editionIdentifier,
        language_short: fileData.language_short || '',
        language_long: fileData.language_long || '',
        identifier: fileData.identifier || '',
        file: filename,
        cardCount: Array.isArray(fileData.cards) ? fileData.cards.length : 0,
      };
    })
  );

  const message = createMessage({
    docs: doc,
    message: 'Edition list retrieved from cache.',
    data: { editions },
  });

  res.json(message);
});

router.post('/', async (req, res) => {
  const {
    edition,
    edition_file,
    edition_name,
    language_short,
    language_long,
    identifier,
    cards,
  } = req.body;

  const doc = documentEndpoint({
    method: 'POST',
    path: '/edition',
    description: 'Creates a new edition JSON file with the required metadata and an empty card list.'
  });

  if (!edition && !edition_file) {
    const errorMessage = createError({
      docs: doc,
      error: 'Edition identifier (`edition`) or target filename (`edition_file`) is required.',
    });
    return res.status(400).json(errorMessage);
  }

  const normalizedFilename = edition_file
    ? path.basename(edition_file)
    : `hitster-${edition}.json`;

  // ⬇️ async: prüfen, ob Edition schon existiert
  const existing = await req.dataCache.readFile(normalizedFilename);
  if (existing) {
    const errorMessage = createError({
      docs: doc,
      error: 'Edition file already exists.',
    });
    return res.status(409).json(errorMessage);
  }

  const editionIdentifier =
    edition || path.basename(normalizedFilename, path.extname(normalizedFilename));

  const payload = {
    edition: editionIdentifier,
    edition_name: edition_name || editionIdentifier,
    language_short: language_short || 'de',
    language_long: language_long || 'Deutsch',
    identifier: identifier || '',
    cards: Array.isArray(cards) ? cards : [],
  };

  await req.dataCache.writeFile(normalizedFilename, payload);

  const message = createMessage({
    docs: doc,
    message: 'New edition file created.',
    data: { file: normalizedFilename, edition: payload.edition },
  });

  res.status(201).json(message);
});

router.get('/:edition', async (req, res) => {
  const doc = documentEndpoint({
    method: 'GET',
    path: '/edition/:edition',
    description: 'Retrieve a specific edition file by its identifier.',
  });

  const filename = await resolveEditionFilename(req, req.params.edition);

  if (!filename) {
    const errorMessage = createError({
      docs: doc,
      error: 'Edition file not found.',
    });
    return res.status(404).json(errorMessage);
  }

  const file = await req.dataCache.readFile(filename);
  if (!file) {
    const errorMessage = createError({
      docs: doc,
      error: 'Edition file could not be loaded.',
    });
    return res.status(404).json(errorMessage);
  }

  const message = createMessage({
    docs: doc,
    message: `Edition ${req.params.edition} loaded.`,
    data: { file },
  });
  res.json(message);
});

router.put('/:edition', async (req, res) => {
  const filename = await resolveEditionFilename(req, req.params.edition);

  const doc = documentEndpoint({
    method: 'PUT',
    path: '/edition/:edition',
    description: 'Update a specific edition file by its identifier.',
  });

  if (!filename) {
    const errorMessage = createError({
      docs: doc,
      error: 'Edition file not found.',
    });
    return res.status(404).json(errorMessage);
  }

  const existing = await req.dataCache.readFile(filename);
  if (!existing) {
    const errorMessage = createError({
      docs: doc,
      error: 'Edition file could not be loaded.',
    });
    return res.status(404).json(errorMessage);
  }

  const cardsPayload = Array.isArray(req.body.cards)
    ? req.body.cards
    : existing.cards;

  const updated = {
    ...existing,
    ...req.body,
    cards: cardsPayload,
  };

  await req.dataCache.writeFile(filename, updated);
  const saved = await req.dataCache.readFile(filename);

  const message = createMessage({
    docs: doc,
    message: `Edition ${req.params.edition} updated.`,
    data: { file: saved },
  });

  res.json(message);
});

router.delete('/:edition', async (req, res) => {
  const filename = await resolveEditionFilename(req, req.params.edition);

  const doc = documentEndpoint({
    method: 'DELETE',
    path: '/edition/:edition',
    description: 'Delete a specific edition file by its identifier.',
  });

  if (!filename) {
    const errorMessage = createError({
      docs: doc,
      error: 'Edition file not found.',
    });
    return res.status(404).json(errorMessage);
  }

  try {
    await req.dataCache.deleteFile(filename);
  } catch (error) {
    console.error('Edition delete failed:', error.message);
    const errorMessage = createError({
      docs: doc,
      error: 'Edition file could not be deleted.',
    });
    return res.status(500).json(errorMessage);
  }

  const message = createMessage({
    docs: doc,
    message: `Edition ${req.params.edition} deleted.`,
    data: { edition: req.params.edition },
  });
  res.json(message);
});

module.exports = router;