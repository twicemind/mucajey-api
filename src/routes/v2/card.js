const express = require('express');
const path = require('path');
const axios = require('axios');
const config = require('../../config');
const result = require('../../utils/result');
const e = require('express');

const router = express.Router();

const APPLE_API_BASE = 'https://api.music.apple.com/v1/catalog';

router.get('/', async (req, res) => {
  const doc = result.documentation({
    method: 'GET',
    path: '/card/',
    description: 'Learn how to interact with the card collection support endpoints. Includes authentication reminder.'
  });
  const message = result.message({
    docs: doc,
    message: 'Card API is ready. The following helper endpoints exist to inspect and mutate cards.',
    notes: 'Include the X-API-Key header as required by the authenticated /api/cards middleware.'
  });
  res.json(message);
});

router.get('/all', async (req, res) => {
  const doc = result.documentation({
    method: 'GET', 
    path: '/card/all', 
    description: 'Returns every card aggregated from the JSON files currently cached in memory. - openapi gen -'});
  const data = req.dataCache.listAllCards();
  const message = result.message({
    docs: doc,
    message: 'All cards returned from cache.',
    data: { cards: data }
  });
  res.json(message);
});

router.get('/id/:edition/:id', async (req, res) => {
  const { edition, id } = req.params;

  const doc = result.documentation({
    method: 'GET', 
    path: '/card/id/:edition/:id', 
    description: 'Retrieve the card that belongs to a specific edition and identifier.'});  
  const cards = req.dataCache.listAllCards();
  const editionCards = cards.filter(card => card.edition === edition);
  const data = editionCards.find(c => c.id === id);
  
  if (data) {
    const message = result.message({
      docs: doc,
      message: 'All cards returned from cache.',
      data: { cards: data }
    });
    res.json(message);
  } else {
    const errorMessage = result.error({
      docs: doc,
      error: 'Card not found.',
      data: {}
    });
    res.status(404).json(errorMessage);
  }
});

router.get('/title/:title', async (req, res) => {
  const title = req.params.title;

  const doc = result.documentation({
    method: 'GET',
    path: '/card/title/:title',
    description: 'List all cards whose title exactly matches the requested value.'
  });

  const cards = req.dataCache.listAllCards();
  const data = cards.filter(card => card.title === title);
  const message = result.message({
    docs: doc,
    message: `Cards with title ${title} returned.`,
    data: { cards: data }
  });
  res.json(message);
});

router.get('/artist/:artist', async (req, res) => {
  const artist = req.params.artist;

  const doc = result.documentation({
    method: 'GET',
    path: '/card/artist/:artist',
    description: 'List all cards whose artist exactly matches the requested value.'
  });

  const cards = req.dataCache.listAllCards();
  const data = cards.filter(card => card.artist === artist);
  const message = result.message({
    docs: doc,
    message: `Cards for artist ${artist} returned.`,
    data: { cards: data }
  });
  res.json(message);
});

router.get('/year/:year', async (req, res) => {
  const year = req.params.year;
  const doc = result.documentation({
    method: 'GET',
    path: '/card/year/:year',
    description: 'List all cards from the specified year.'
  });
  const cards = req.dataCache.listAllCards();
  const data = cards.filter(card => card.year === year);
  const message = result.message({
    docs: doc,
    message: `Cards from year ${year} returned.`,
    data: { cards: data }
  });
  res.json(message);
});

router.get('/edition/:edition', async (req, res) => {
  const edition = req.params.edition;
  const doc = result.documentation({
    method: 'GET',
    path: '/card/edition/:edition',
    description: 'List all cards from the specified edition.'
  });
  const cards = req.dataCache.listAllCards();
  const data = cards.filter(card => card.edition === edition);
  const message = result.message({
    docs: doc,
    message: `Cards for edition ${edition} returned.`,
    data: { cards: data }
  });
  res.json(message);
});

router.get('/genre/:genre', async (req, res) => {
  const genre = req.params.genre;
  const doc = result.documentation({
    method: 'GET',
    path: '/card/genre/:genre',
    description: 'List all cards from the specified genre.'
  });
  const cards = req.dataCache.listAllCards();
  const data = cards.filter(card => card.genre === genre);
  const message = result.message({
    docs: doc,
    message: `Cards for genre ${genre} returned.`,
    data: { cards: data }
  });
  res.json(message);
});

router.get('/search/:query', async (req, res) => {
  const query = req.params.query;
  const doc = result.documentation({
    method: 'GET',
    path: '/card/search/:query',
    description: 'Search for cards matching the query string.'
  });
  const cards = req.dataCache.listAllCards();
  const searchResults = cards.filter(card =>
    Object.values(card).some(value =>
      typeof value === 'string' && value.toLowerCase().includes(query.toLowerCase())
    )
  );
  const message = result.message({
    docs: doc,
    message: `Search results for query "${query}" returned.`,
    data: { cards: searchResults }
  });
  res.json(message);
});

router.post('/', async (req, res) => {
  const { edition_file, edition, id, title, artist, year } = req.body;

  const doc = result.documentation({
    method: 'POST',
    path: '/card',
    description: 'Create a new card.'
  });

  if (!edition_file && !edition) {
    const errorMessage = result.error({
      docs: doc,
      error: 'edition_file oder edition erforderlich'
    });
    return res.status(400).json(errorMessage);
  }
  if (!id || !title || !artist || !year) {
    const errorMessage = result.error({
      docs: doc,
      error: 'id, title, artist und year müssen gesetzt sein'
    });
    return res.status(400).json(errorMessage);
  }

  const targetFile = edition_file || `hitster-${edition}.json`;
  const fileData = req.dataCache.readFile(targetFile) || { cards: [] };

  fileData.cards.push({
    edition_file: targetFile,
    edition_name: fileData.edition || edition,
    edition: edition || path.basename(targetFile, '.json'),
    id,
    title,
    artist,
    year,
    apple: req.body.apple || null,
    spotify: req.body.spotify || null
  });

  await req.dataCache.writeFile(targetFile, fileData);

  const message = result.message({
    docs: doc,
    message: 'New card stored.',
    data: { card: fileData.cards[fileData.cards.length - 1] }
  });

  res.status(201).json(message);
});

router.post('/:edition/:id/apple/search', async (req, res) => {
  const { edition, id } = req.params;
  const storefront = req.query.storefront || config.APPLE_MUSIC_STORE;

  const doc = result.documentation({
    method: 'POST',
    path: '/card/:edition/:id/apple/search',
    description: 'Run an Apple Music search for the requested card and persist the ID+URI.'
  });

  if (!config.APPLE_MUSIC_API_TOKEN) {
    return res.status(500).json(result.error({
      docs: doc,
      error: 'Apple Music token is not configured'
    }));
  }

  const cards = req.dataCache.listAllCards();
  const card = cards.find(c => c.edition === edition && c.id === id);

  if (!card) {
    return res.status(404).json(result.error({
      docs: doc,
      error: 'Card not found'
    }));
  }

  const searchParts = [card.title, card.artist, card.year].filter(Boolean);

  if (!searchParts.length) {
    return res.status(400).json(result.error({
      docs: doc,
      error: 'Card missing searchable metadata'
    }));
  }

  const searchTerm = searchParts.join(' ');

  try {
    const response = await axios.get(`${APPLE_API_BASE}/${storefront}/search`, {
      params: {
        term: searchTerm,
        types: 'songs',
        limit: 1
      },
      headers: {
        Authorization: `Bearer ${config.APPLE_MUSIC_API_TOKEN}`
      }
    });

    const songs = response.data?.results?.songs?.data || [];

    if (!songs.length) {
      return res.status(404).json(result.error({
        docs: doc,
        error: 'No Apple Music match found'
      }));
    }

    const track = songs[0];
    const uri = track.attributes?.url || track.attributes?.previews?.[0]?.url || track.href;
    const appleInfo = {
      id: track.id,
      uri
    };

    const filename = card.edition_file;
    const fileData = req.dataCache.readFile(filename);
    const targetCard = fileData.cards.find(c => c.id === id);

    if (!targetCard) {
      return res.status(404).json(result.error({
        docs: doc,
        error: 'Card data could not be loaded'
      }));
    }

    targetCard.apple = appleInfo;

    await req.dataCache.writeFile(filename, fileData);

    res.json(result.message({
      docs: doc,
      message: 'Apple Music metadata mapped to card',
      data: { card: targetCard, apple: appleInfo }
    }));
  } catch (err) {
    console.error('Apple Music lookup failed:', err.message);
    res.status(502).json(result.error({
      docs: doc,
      error: 'Apple Music lookup failed',
      details: err.message
    }));
  }
});

router.patch('/:edition/:id', async (req, res) => {
  const { edition, id } = req.params;
  const doc = result.documentation({
    method: 'PATCH',
    path: '/card/:edition/:id',
    description: 'Update a card by edition and id.'
  });
  const cards = req.dataCache.listAllCards();
  const card = cards.find(c => c.edition === edition && c.id === id);

  if (!card) {
    const errorMessage = result.error({
      docs: doc,
      error: 'Karte nicht gefunden'
    });
    return res.status(404).json(errorMessage);
  }

  const filename = card.edition_file;
  const fileData = req.dataCache.readFile(filename);
  const targetCard = fileData.cards.find(c => c.id === id);
  Object.assign(targetCard, req.body);

  await req.dataCache.writeFile(filename, fileData);

  const message = result.message({
    docs: doc,
    message: `Card ${id} updated.`,
    data: { card: targetCard }
  });

  res.json(message);
});

router.delete('/:edition/:id', async (req, res) => {
  const { edition, id } = req.params;
  const doc = result.documentation({
    method: 'DELETE',
    path: '/card/:edition/:id',
    description: 'Delete a card by edition and id.'
  });

  const cards = req.dataCache.listAllCards();
  const card = cards.find(c => c.edition === edition && c.id === id);

  if (!card) {
    const errorMessage = result.error({
      docs: doc,
      error: 'Karte nicht gefunden'
    });
    return res.status(404).json(errorMessage);
  }

  const filename = card.edition_file;
  const fileData = req.dataCache.readFile(filename);
  const cardIndex = fileData.cards.findIndex(c => c.id === id);

  if (cardIndex === -1) {
    return res.status(404).json({ error: 'Karte nicht gefunden' });
  }

  fileData.cards.splice(cardIndex, 1);
  await req.dataCache.writeFile(filename, fileData);

  const message = result.message({
    docs: doc,
    message: `Card ${id} deleted.`
  });
  res.json(message);
});

module.exports = router;