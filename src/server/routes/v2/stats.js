const express = require('express');
const result = require('../../utils/result');

const router = express.Router();

function getEditionKeyFromCard(card) {
  return card?.edition_id || card?.edition || 'unknown';
}

function safeString(v) {
  return typeof v === 'string' ? v : '';
}

async function buildEditionSummaries(req, editionIds) {
  const summaries = await Promise.all(
    (editionIds || []).map(async edition_id => {
      const editionData = (await req.editionsCache.get(edition_id)) || {};
      const cards = await req.cardsCache.getByEdition(edition_id);

      const resolvedId =
        editionData.edition_id || editionData.edition || edition_id;
      const resolvedName =
        editionData.edition_name || editionData.edition || resolvedId;

      return {
        edition_id: resolvedId,
        edition_name: resolvedName,
        language_short: safeString(editionData.language_short),
        language_long: safeString(editionData.language_long),
        identifier: safeString(editionData.identifier),
        cardCount: Array.isArray(cards) ? cards.length : 0,
      };
    })
  );

  // Ensure uniqueness by edition_id (in case cache returns duplicates)
  const byId = new Map();
  for (const s of summaries) {
    if (s && s.edition_id) byId.set(s.edition_id, s);
  }
  return Array.from(byId.values());
}

router.get('/', async (req, res) => {
  const doc = result.documentation({
    method: 'GET',
    path: '/stats',
    description:
      'Collects aggregated statistics about cached editions and cards.',
  });

  const cards = await req.cardsCache.getAll();
  const editionIds = await req.editionsCache.getAll();
  const editions = await buildEditionSummaries(req, editionIds);

  const uniqueEdits = new Set(editions.map(e => e.edition_id).filter(Boolean));

  const summary = {
    total_cards: Array.isArray(cards) ? cards.length : 0,
    total_editions: uniqueEdits.size,

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

  for (const card of Array.isArray(cards) ? cards : []) {
    const appleId = card?.apple?.id;
    const appleUri = card?.apple?.uri;
    const spotifyId = card?.spotify?.id;
    const spotifyUri = card?.spotify?.uri;

    const hasApple = Boolean(appleId || appleUri);
    const hasSpotify = Boolean(spotifyId || spotifyUri);

    const editionKey = getEditionKeyFromCard(card);

    if (appleId) summary.cards_with_apple_id += 1;
    if (appleUri) summary.cards_with_apple_uri += 1;
    if (spotifyId) summary.cards_with_spotify_id += 1;
    if (spotifyUri) summary.cards_with_spotify_uri += 1;

    if (hasApple && hasSpotify) summary.cards_with_both_streaming += 1;
    if (hasApple || hasSpotify) summary.cards_with_any_streaming += 1;
    else summary.cards_missing_streaming += 1;

    if (!card?.id) summary.cards_without_identifier += 1;

    const language = (card?.language_short || 'unknown').toLowerCase();
    summary.language_distribution[language] =
      (summary.language_distribution[language] || 0) + 1;

    const year = card?.year || 'unknown';
    summary.cards_by_year[year] = (summary.cards_by_year[year] || 0) + 1;

    const genre = card?.genre || 'unknown';
    summary.cards_by_genre[genre] = (summary.cards_by_genre[genre] || 0) + 1;

    summary.cards_per_edition[editionKey] =
      (summary.cards_per_edition[editionKey] || 0) + 1;
  }

  if (uniqueEdits.size > 0) {
    summary.average_cards_per_edition =
      Math.round((summary.total_cards / uniqueEdits.size) * 100) / 100;
  }

  const message = result.message({
    docs: doc,
    message: 'Statistics aggregated from the cached editions.',
    data: { summary, editions },
  });

  res.json(message);
});

module.exports = router;
