const express = require('express');
const fs = require('fs');
const {
  documentation: documentEndpoint,
  message: createMessage,
  error: createError,
} = require('../../utils/result');
const {
  resolveEdition,
  getBaseUrl,
  getEditionImageFilename,
  getEditionImagePath,
} = require('./edition-utils');

const router = express.Router();

router.get('/', async (req, res) => {
  const doc = documentEndpoint({
    method: 'GET',
    path: '/edition/',
    description:
      'Explains how to create a new card edition data inside the edition store.',
  });
  const message = createMessage({
    docs: doc,
    message: 'Edition helper endpoint is ready.',
    notes:
      'Provide either `edition` or `edition_id` plus optional metadata when creating a new edition.',
  });
  res.json(message);
});

router.get('/all', async (req, res) => {
  const doc = documentEndpoint({
    method: 'GET',
    path: '/edition/all',
    description:
      'List every edition edition_id along with metadata that is currently cached in memory.',
  });

  const data = await req.editionsCache.getAll();

  const editions = await Promise.all(
    data.map(async edition_id => {
      console.log('Lade Edition:', edition_id);
      const editionData = (await req.editionsCache.get(edition_id)) || {};
      const editionIdentifier = editionData.edition_id;
      const cards = await req.cardsCache.getByEdition(editionIdentifier);

      const imageHref = `${getBaseUrl(req)}/edition/image/${edition_id}`;
      const imagePath = getEditionImagePath(edition_id);

      const image = {
        href: imageHref,
        exists: fs.existsSync(imagePath),
        filename: getEditionImageFilename(edition_id),
      };

      return {
        edition_id: editionData.edition_id,
        edition_name: editionData.edition_name || editionIdentifier,
        language_short: editionData.language_short || '',
        language_long: editionData.language_long || '',
        identifier: editionData.identifier || '',
        spotify_playlist: editionData.spotify_playlist || '',
        image: image,
        cardCount: Array.isArray(cards) ? cards.length : 0,
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
    edition_id,
    edition_name,
    language_short,
    language_long,
    identifier,
    spotify_playlist,
    cards,
  } = req.body;

  const doc = documentEndpoint({
    method: 'POST',
    path: '/edition',
    description:
      'Creates a new edition JSON edition_id with the required metadata and an empty card list.',
  });

  if (!edition_name && !edition_id) {
    const errorMessage = createError({
      docs: doc,
      error:
        'Edition identifier (`edition`) or target edition_id (`edition_id`) is required.',
    });
    return res.status(400).json(errorMessage);
  }

  const existing = await req.editionsCache.get(edition_id);
  if (existing) {
    const errorMessage = createError({
      docs: doc,
      error: 'Edition edition_id already exists.',
    });
    return res.status(409).json(errorMessage);
  }

  const payload = {
    edition_id: edition_id,
    edition_name: edition_name,
    language_short: language_short || 'de',
    language_long: language_long || 'Deutsch',
    identifier: identifier || '',
    spotify_playlist: spotify_playlist || '',
    cards: Array.isArray(cards) ? cards : [],
  };

  await req.editionsCache.write(edition_id, payload);
  const message = createMessage({
    docs: doc,
    message: 'New edition edition_id created.',
    data: { edition_id: edition_id, edition: payload.edition },
  });

  res.status(201).json(message);
});

router.get('/:edition_id', async (req, res) => {
  const doc = documentEndpoint({
    method: 'GET',
    path: '/edition/:edition_id',
    description: 'Retrieve a specific edition edition_id by its identifier.',
  });

  const edition_id = await resolveEdition(req, req.params.edition_id);

  if (!edition_id) {
    const errorMessage = createError({
      docs: doc,
      error: 'Edition edition_id not found.',
    });
    return res.status(404).json(errorMessage);
  }

  const edition = await req.editionsCache.get(edition_id);
  if (!edition) {
    const errorMessage = createError({
      docs: doc,
      error: 'Edition edition_id could not be loaded.',
    });
    return res.status(404).json(errorMessage);
  }

  const imageHref = `${getBaseUrl(req)}/edition/image/${edition_id}`;
  const imagePath = getEditionImagePath(edition_id);

  const image = {
    href: imageHref,
    exists: fs.existsSync(imagePath),
    filename: getEditionImageFilename(edition_id),
  };

  const message = createMessage({
    docs: doc,
    message: `Edition ${req.params.edition_id} loaded.`,
    data: { edition_id: edition_id, edition, image },
  });
  res.json(message);
});

router.put('/:edition_id', async (req, res) => {
  const edition_id = await resolveEdition(req, req.params.edition_id);

  const doc = documentEndpoint({
    method: 'PUT',
    path: '/edition/:edition_id',
    description: 'Update a specific edition edition_id by its identifier.',
  });

  if (!edition_id) {
    const errorMessage = createError({
      docs: doc,
      error: 'Edition edition_id not found.',
    });
    return res.status(404).json(errorMessage);
  }

  const edition = await req.editionsCache.get(edition_id);
  if (!edition) {
    const errorMessage = createError({
      docs: doc,
      error: 'Edition edition_id could not be loaded.',
    });
    return res.status(404).json(errorMessage);
  }

  const updated = {
    ...edition,
    ...req.body,
  };

  await req.editionsCache.write(edition_id, updated);
  const saved = await req.editionsCache.get(edition_id);

  const message = createMessage({
    docs: doc,
    message: `Edition ${req.params.edition_id} updated.`,
    data: { edition_id: edition_id, edition: saved },
  });

  res.json(message);
});

router.delete('/:edition_id', async (req, res) => {
  const edition_id = await resolveEdition(req, req.params.edition_id);

  const doc = documentEndpoint({
    method: 'DELETE',
    path: '/edition/:edition_id',
    description: 'Delete a specific edition edition_id by its identifier.',
  });

  if (!edition_id) {
    const errorMessage = createError({
      docs: doc,
      error: 'Edition edition_id not found.',
    });
    return res.status(404).json(errorMessage);
  }

  try {
    await req.editionsCache.delete(edition_id);
    if (req.cardsCache?.deleteMany) {
      await req.cardsCache.deleteMany(edition_id);
    }
  } catch (error) {
    console.error('Edition delete failed:', error.message);
    const errorMessage = createError({
      docs: doc,
      error: 'Edition edition_id could not be deleted.',
    });
    return res.status(500).json(errorMessage);
  }

  const message = createMessage({
    docs: doc,
    message: `Edition ${req.params.edition_id} deleted.`,
    data: { edition_id: edition_id, edition: 'deleted' },
  });
  res.json(message);
});

module.exports = router;
