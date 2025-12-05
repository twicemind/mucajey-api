const express = require('express');
const path = require('path');
const axios = require('axios');
const config = require('../../config');
const result = require('../../utils/result');

const router = express.Router();

const APPLE_API_BASE = 'https://api.music.apple.com/v1/catalog';

function normalizeEditionInput(edition, editionFile) {
  if (editionFile) {
    const filename = path.basename(editionFile);
    const editionId = path.basename(filename, '.json');
    return { editionId, editionFile: filename };
  }

  if (edition) {
    const cleaned = path.basename(edition);
    const editionId = cleaned.endsWith('.json')
      ? path.basename(cleaned, '.json')
      : cleaned;
    return { editionId, editionFile: `${editionId}.json` };
  }

  return { editionId: null, editionFile: null };
}

async function buildEditionMetaMap(req) {
  const map = new Map();

  let editionFiles = [];
  try {
    editionFiles = await req.editionsCache.getAll();
  } catch (err) {
    console.error('Edition cache not available:', err.message);
    return map;
  }

  if (!Array.isArray(editionFiles)) {
    return map;
  }

  for (const file of editionFiles) {
    try {
      const edition = await req.editionsCache.get(file);
      if (!edition) {
        continue;
      }

      const editionId = edition.edition || path.basename(file, '.json');
      map.set(editionId, {
        edition_file: file,
        edition_name: edition.edition_name || editionId,
      });
    } catch (error) {
      console.error(
        `Edition metadata for '${file}' could not be loaded:`,
        error.message
      );
    }
  }

  return map;
}

function normalizeCardForResponse(card, editionMeta) {
  if (!card) {
    return card;
  }

  const { _id: omittedId, ...rest } = card;
  void omittedId; // remove MongoDB id
  const editionId =
    rest.edition ||
    (rest.edition_file && path.basename(rest.edition_file, '.json'));
  const meta = editionMeta?.get(editionId);
  const edition_file =
    rest.edition_file || (editionId ? `${editionId}.json` : undefined);
  const edition_name = rest.edition_name || meta?.edition_name || editionId;

  return {
    ...rest,
    edition: editionId,
    edition_file,
    edition_name,
  };
}

async function getNormalizedCards(req) {
  const [cards, editionMeta] = await Promise.all([
    req.cardsCache.getAll(),
    buildEditionMetaMap(req),
  ]);

  return cards.map(card => normalizeCardForResponse(card, editionMeta));
}

async function getNormalizedCardsByEdition(req, edition) {
  const [cards, editionMeta] = await Promise.all([
    req.cardsCache.getByEdition(edition),
    buildEditionMetaMap(req),
  ]);

  return cards.map(card => normalizeCardForResponse(card, editionMeta));
}

async function findNormalizedCard(req, edition, id) {
  const cards = await getNormalizedCardsByEdition(req, edition);
  return cards.find(c => String(c.id) === String(id));
}

router.get('/', async (req, res) => {
  const doc = result.documentation({
    method: 'GET',
    path: '/card/',
    description:
      'Learn how to interact with the card collection support endpoints. Includes authentication reminder.',
  });
  const message = result.message({
    docs: doc,
    message:
      'Card API is ready. The following helper endpoints exist to inspect and mutate cards.',
    notes:
      'Include the X-API-Key header as required by the authenticated /api/cards middleware.',
  });
  res.json(message);
});

router.get('/all', async (req, res) => {
  const doc = result.documentation({
    method: 'GET',
    path: '/card/all',
    description:
      'Returns every card aggregated from the JSON files currently cached in memory. - openapi gen -',
  });

  const data = await getNormalizedCards(req);

  const message = result.message({
    docs: doc,
    message: 'All cards returned from cache.',
    data: { cards: data },
  });
  res.json(message);
});

router.get('/id/:edition/:id', async (req, res) => {
  const { edition, id } = req.params;

  const doc = result.documentation({
    method: 'GET',
    path: '/card/id/:edition/:id',
    description:
      'Retrieve the card that belongs to a specific edition and identifier.',
  });

  const data = await findNormalizedCard(req, edition, id);

  if (data) {
    const message = result.message({
      docs: doc,
      message: 'All cards returned from cache.',
      data: { cards: data },
    });
    res.json(message);
  } else {
    const errorMessage = result.error({
      docs: doc,
      error: 'Card not found.',
      data: {},
    });
    res.status(404).json(errorMessage);
  }
});

router.get('/title/:title', async (req, res) => {
  const title = req.params.title;

  const doc = result.documentation({
    method: 'GET',
    path: '/card/title/:title',
    description:
      'List all cards whose title exactly matches the requested value.',
  });

  const cards = await getNormalizedCards(req);
  const data = cards.filter(card => card.title === title);
  const message = result.message({
    docs: doc,
    message: `Cards with title ${title} returned.`,
    data: { cards: data },
  });
  res.json(message);
});

router.get('/artist/:artist', async (req, res) => {
  const artist = req.params.artist;

  const doc = result.documentation({
    method: 'GET',
    path: '/card/artist/:artist',
    description:
      'List all cards whose artist exactly matches the requested value.',
  });

  const cards = await getNormalizedCards(req);
  const data = cards.filter(card => card.artist === artist);
  const message = result.message({
    docs: doc,
    message: `Cards for artist ${artist} returned.`,
    data: { cards: data },
  });
  res.json(message);
});

router.get('/year/:year', async (req, res) => {
  const year = req.params.year;

  const doc = result.documentation({
    method: 'GET',
    path: '/card/year/:year',
    description: 'List all cards from the specified year.',
  });

  const cards = await getNormalizedCards(req);
  const data = cards.filter(card => card.year === year);
  const message = result.message({
    docs: doc,
    message: `Cards from year ${year} returned.`,
    data: { cards: data },
  });
  res.json(message);
});

router.get('/edition/:edition', async (req, res) => {
  const edition = req.params.edition;

  const doc = result.documentation({
    method: 'GET',
    path: '/card/edition/:edition',
    description: 'List all cards from the specified edition.',
  });

  const data = await getNormalizedCardsByEdition(req, edition);
  const message = result.message({
    docs: doc,
    message: `Cards for edition ${edition} returned.`,
    data: { cards: data },
  });
  res.json(message);
});

router.get('/genre/:genre', async (req, res) => {
  const genre = req.params.genre;

  const doc = result.documentation({
    method: 'GET',
    path: '/card/genre/:genre',
    description: 'List all cards from the specified genre.',
  });

  const cards = await getNormalizedCards(req);
  const data = cards.filter(card => card.genre === genre);
  const message = result.message({
    docs: doc,
    message: `Cards for genre ${genre} returned.`,
    data: { cards: data },
  });
  res.json(message);
});

router.get('/search/:query', async (req, res) => {
  const query = req.params.query;

  const doc = result.documentation({
    method: 'GET',
    path: '/card/search/:query',
    description: 'Search for cards matching the query string.',
  });

  const cards = await getNormalizedCards(req);
  const searchResults = cards.filter(card =>
    Object.values(card).some(
      value =>
        typeof value === 'string' &&
        value.toLowerCase().includes(query.toLowerCase())
    )
  );

  const message = result.message({
    docs: doc,
    message: `Search results for query "${query}" returned.`,
    data: { cards: searchResults },
  });
  res.json(message);
});

router.post('/', async (req, res) => {
  const { edition_file, edition, id, title, artist, year } = req.body;

  const doc = result.documentation({
    method: 'POST',
    path: '/card',
    description: 'Create a new card.',
  });

  if (!edition_file && !edition) {
    const errorMessage = result.error({
      docs: doc,
      error: 'edition_file oder edition erforderlich',
    });
    return res.status(400).json(errorMessage);
  }
  if (!id || !title || !artist || !year) {
    const errorMessage = result.error({
      docs: doc,
      error: 'id, title, artist und year müssen gesetzt sein',
    });
    return res.status(400).json(errorMessage);
  }

  const { editionId, editionFile } = normalizeEditionInput(
    edition,
    edition_file
  );
  const editionMeta = await buildEditionMetaMap(req);

  const newCardPayload = {
    edition: editionId,
    edition_file: editionFile,
    edition_name: editionMeta.get(editionId)?.edition_name || editionId,
    id,
    title,
    artist,
    year,
    apple: req.body.apple || null,
    spotify: req.body.spotify || null,
  };

  const savedCard = await req.cardsCache.write(editionId, newCardPayload);
  const normalizedCard = normalizeCardForResponse(
    savedCard || newCardPayload,
    editionMeta
  );

  const message = result.message({
    docs: doc,
    message: 'New card stored.',
    data: { card: normalizedCard },
  });

  res.status(201).json(message);
});

router.post('/:edition/:id/apple/search', async (req, res) => {
  const { edition, id } = req.params;
  const storefront = req.query.storefront || config.APPLE_MUSIC_STORE;

  const doc = result.documentation({
    method: 'POST',
    path: '/card/:edition/:id/apple/search',
    description:
      'Run an Apple Music search for the requested card and persist the ID+URI.',
  });

  if (!config.APPLE_MUSIC_API_TOKEN) {
    return res.status(500).json(
      result.error({
        docs: doc,
        error: 'Apple Music token is not configured',
      })
    );
  }

  const existingCards = await req.cardsCache.getByEdition(edition);
  const card = existingCards.find(c => String(c.id) === String(id));

  if (!card) {
    return res.status(404).json(
      result.error({
        docs: doc,
        error: 'Card not found',
      })
    );
  }

  const searchParts = [card.title, card.artist, card.year].filter(Boolean);

  if (!searchParts.length) {
    return res.status(400).json(
      result.error({
        docs: doc,
        error: 'Card missing searchable metadata',
      })
    );
  }

  const searchTerm = searchParts.join(' ');

  try {
    const response = await axios.get(`${APPLE_API_BASE}/${storefront}/search`, {
      params: {
        term: searchTerm,
        types: 'songs',
        limit: 1,
      },
      headers: {
        Authorization: `Bearer ${config.APPLE_MUSIC_API_TOKEN}`,
      },
    });

    const songs = response.data?.results?.songs?.data || [];

    if (!songs.length) {
      return res.status(404).json(
        result.error({
          docs: doc,
          error: 'No Apple Music match found',
        })
      );
    }

    const track = songs[0];
    const uri =
      track.attributes?.url ||
      track.attributes?.previews?.[0]?.url ||
      track.href;

    const appleInfo = {
      id: track.id,
      uri,
    };

    const updatedCard = await req.cardsCache.update(edition, id, {
      apple: appleInfo,
    });
    const editionMeta = await buildEditionMetaMap(req);
    const normalizedCard = normalizeCardForResponse(
      updatedCard || { ...card, apple: appleInfo },
      editionMeta
    );

    res.json(
      result.message({
        docs: doc,
        message: 'Apple Music metadata mapped to card',
        data: { card: normalizedCard, apple: appleInfo },
      })
    );
  } catch (err) {
    console.error('Apple Music lookup failed:', err.message);
    res.status(502).json(
      result.error({
        docs: doc,
        error: 'Apple Music lookup failed',
        details: err.message,
      })
    );
  }
});

router.patch('/:edition/:id', async (req, res) => {
  const { edition, id } = req.params;

  const doc = result.documentation({
    method: 'PATCH',
    path: '/card/:edition/:id',
    description: 'Update a card by edition and id.',
  });

  const existingCard = await findNormalizedCard(req, edition, id);

  if (!existingCard) {
    const errorMessage = result.error({
      docs: doc,
      error: 'Karte nicht gefunden',
    });
    return res.status(404).json(errorMessage);
  }

  const updatedCard = await req.cardsCache.update(edition, id, req.body);
  const editionMeta = await buildEditionMetaMap(req);
  const normalizedCard = normalizeCardForResponse(
    updatedCard || { ...existingCard, ...req.body },
    editionMeta
  );

  const message = result.message({
    docs: doc,
    message: `Card ${id} updated.`,
    data: { card: normalizedCard },
  });

  res.json(message);
});

router.delete('/:edition/:id', async (req, res) => {
  const { edition, id } = req.params;

  const doc = result.documentation({
    method: 'DELETE',
    path: '/card/:edition/:id',
    description: 'Delete a card by edition and id.',
  });

  const existingCard = await findNormalizedCard(req, edition, id);

  if (!existingCard) {
    const errorMessage = result.error({
      docs: doc,
      error: 'Karte nicht gefunden',
    });
    return res.status(404).json(errorMessage);
  }

  await req.cardsCache.delete(edition, id);

  const message = result.message({
    docs: doc,
    message: `Card ${id} deleted.`,
  });
  res.json(message);
});

module.exports = router;

// Expose internal helpers for testing
module.exports._test = {
  normalizeEditionInput,
  buildEditionMetaMap,
  normalizeCardForResponse,
};
