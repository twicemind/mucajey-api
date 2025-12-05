const express = require('express');
const router = express.Router();
const { loadImportFile, saveImportFile } = require('../../utils/client.file');
const result = require('../../utils/result');

// Import-Datei anzeigen
router.get('/', async (req, res) => {
  const doc = result.documentation({
    method: 'GET',
    path: '/',
    description: 'Show import file',
  });
  try {
    const data = await loadImportFile();
    const message = result.message({
      docs: doc,
      message: 'Import file loaded',
      data: data,
    });
    res.json(message);
  } catch (error) {
    const errorMessage = result.error({
      docs: doc,
      error: 'Fehler beim Laden der Import-Datei',
      details: error.message,
    });
    res.status(500).json(errorMessage);
  }
});

// Import-Datei leeren
router.delete('/', async (req, res) => {
  const doc = result.documentation({
    method: 'DELETE',
    path: '/',
    description: 'Clear import file',
  });
  try {
    const data = await loadImportFile();
    const clearedCount = data.imports ? data.imports.length : 0;

    data.imports = [];
    await saveImportFile(data);
    const message = result.message({
      docs: doc,
      message: 'Import-Datei geleert',
      data: {
        clearedCount: clearedCount,
      },
    });
    res.json(message);
  } catch (error) {
    const errorMessage = result.error({
      docs: doc,
      error: 'Fehler beim Leeren der Import-Datei',
      details: error.message,
    });
    res.status(500).json(errorMessage);
  }
});

module.exports = router;
