const express = require('express');
const path = require('path');
const result = require('../../utils/result');

const router = express.Router();

async function buildEditionSummaries(req, files) {
  return Promise.all(
    files.map(async filename => {
      const fileData = (await req.editionsCache.get(filename)) || {};
      const editionIdentifier =
        fileData.edition || path.basename(filename, '.json');
      const cards = await req.cardsCache.getByEdition(editionIdentifier);

      return {
        edition: editionIdentifier,
        edition_name: fileData.edition_name || editionIdentifier,
        language_short: fileData.language_short || '',
        language_long: fileData.language_long || '',
        identifier: fileData.identifier || '',
        file: filename,
        cardCount: Array.isArray(cards) ? cards.length : 0,
      };
    })
  );
}

router.get('/', async (req, res) => {
  const doc = result.documentation({
    method: 'GET',
    path: '/stats',
    description:
      'Collects aggregated statistics about cached editions and cards.',
  });

  const cards = await req.cardsCache.getAll();
  const files = await req.editionsCache.getAll();
  const editions = await buildEditionSummaries(req, files);

  const uniqueEdits = new Set(editions.map(entry => entry.edition));

  const summary = {
    total_cards: cards.length,
    total_editions: uniqueEdits.size,
    total_files: files.length,
    cards_with_apple_id: 0,
    cards_with_apple_uri: 0,
    cards_with_spotify_id: 0,
    cards_with_spotify_uri: 0,
    cards_with_both_streaming: 0,
    cards_with_any_streaming: 0,
    cards_missing_streaming: 0,
    cards_without_identifier: 0,
    average_cards_per_edition: 0,
    language_distribution: {},
    cards_by_year: {},
    cards_by_genre: {},
    cards_per_edition: {},
  };

  for (const card of cards) {
    const appleId = card.apple && card.apple.id;
    const appleUri = card.apple && card.apple.uri;
    const spotifyId = card.spotify && card.spotify.id;
    const spotifyUri = card.spotify && card.spotify.uri;
    const hasApple = Boolean(appleId || appleUri);
    const hasSpotify = Boolean(spotifyId || spotifyUri);
    const editionKey = card.edition || card.edition_file || 'unknown';

    if (appleId) summary.cards_with_apple_id += 1;
    if (appleUri) summary.cards_with_apple_uri += 1;
    if (spotifyId) summary.cards_with_spotify_id += 1;
    if (spotifyUri) summary.cards_with_spotify_uri += 1;

    if (hasApple && hasSpotify) summary.cards_with_both_streaming += 1;
    if (hasApple || hasSpotify) {
      summary.cards_with_any_streaming += 1;
    } else {
      summary.cards_missing_streaming += 1;
    }

    if (!card.id) summary.cards_without_identifier += 1;

    const language = (card.language_short || 'unknown').toLowerCase();
    summary.language_distribution[language] =
      (summary.language_distribution[language] || 0) + 1;

    const year = card.year || 'unknown';
    summary.cards_by_year[year] = (summary.cards_by_year[year] || 0) + 1;

    const genre = card.genre || 'unknown';
    summary.cards_by_genre[genre] = (summary.cards_by_genre[genre] || 0) + 1;

    summary.cards_per_edition[editionKey] =
      (summary.cards_per_edition[editionKey] || 0) + 1;
  }

  if (uniqueEdits.size > 0) {
    summary.average_cards_per_edition =
      Math.round((cards.length / uniqueEdits.size) * 100) / 100;
  }

  const message = result.message({
    docs: doc,
    message: 'Statistics aggregated from the cached editions.',
    data: { summary, editions },
  });

  res.json(message);
});

module.exports = router;
