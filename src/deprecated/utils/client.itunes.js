const axios = require('axios');

/**
 * Normalisiere Strings für Matching
 */
function normalizeString(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s*\(?\s*(feat\.|ft\.|featuring)\s+[^)]*\)?/gi, '')
    .replace(/p!nk/gi, 'pink')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Berechnet Levenshtein-Ähnlichkeit
 */
function calculateSimilarity(str1, str2) {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 100;

  const editDistance = levenshteinDistance(longer, shorter);
  return ((longer.length - editDistance) / longer.length) * 100;
}

/**
 * Berechnet Levenshtein-Distanz
 */
function levenshteinDistance(str1, str2) {
  const matrix = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

/**
 * Sucht einen Track in der iTunes Search API
 */
async function searchItunesTrack(title, artist, country = 'de') {
  try {
    const searchTerm = `${artist} ${title}`.trim();

    const response = await axios.get('https://itunes.apple.com/search', {
      params: {
        term: searchTerm,
        media: 'music',
        entity: 'song',
        country: country,
        limit: 5,
      },
    });

    if (!response.data.results || response.data.results.length === 0) {
      return null;
    }

    // Extrahiere Text in Klammern falls vorhanden (für Soundtracks)
    let titleForMatching = title;
    const parenthesesMatch = title.match(/\(([^)]+)\)/);
    if (parenthesesMatch) {
      titleForMatching = parenthesesMatch[1];
    }

    const normalizedSearchTitle = normalizeString(titleForMatching);
    const normalizedSearchArtist = normalizeString(artist.split(/[&,]/)[0]);

    // Finde besten Match
    let bestMatch = null;
    let bestScore = 0;

    for (const track of response.data.results) {
      const normalizedTrackTitle = normalizeString(track.trackName || '');
      const normalizedTrackArtist = normalizeString(track.artistName || '');

      // Exaktes Matching bevorzugen
      const titleMatch =
        normalizedTrackTitle.includes(normalizedSearchTitle) ||
        normalizedSearchTitle.includes(normalizedTrackTitle);
      const artistMatch =
        normalizedTrackArtist.includes(normalizedSearchArtist) ||
        normalizedSearchArtist.includes(normalizedTrackArtist);

      if (titleMatch && artistMatch) {
        return {
          id: String(track.trackId),
          uri: track.trackViewUrl,
          name: track.trackName,
          artist: track.artistName,
          album: track.collectionName,
          previewUrl: track.previewUrl,
        };
      }

      // Berechne Score für Fuzzy Matching
      const titleSimilarity = calculateSimilarity(
        normalizedTrackTitle,
        normalizedSearchTitle
      );
      const artistSimilarity = calculateSimilarity(
        normalizedTrackArtist,
        normalizedSearchArtist
      );
      const score = titleSimilarity * 0.6 + artistSimilarity * 0.4;

      if (score > bestScore && score >= 70) {
        bestScore = score;
        bestMatch = {
          id: String(track.trackId),
          uri: track.trackViewUrl,
          name: track.trackName,
          artist: track.artistName,
          album: track.collectionName,
          previewUrl: track.previewUrl,
        };
      }
    }

    return bestMatch;
  } catch (error) {
    if (error.response) {
      console.error(
        'iTunes Search API Fehler:',
        error.response.status,
        error.response.statusText
      );
      console.error('  Searched:', `${artist} - ${title}`);
    } else {
      console.error('iTunes Search API Fehler:', error.message);
    }
    return null;
  }
}

module.exports = {
  searchItunesTrack,
  normalizeString,
  calculateSimilarity,
  levenshteinDistance,
};
