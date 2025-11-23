const express = require('express');
const router = express.Router();
const { loadImportFile, saveImportFile } = require('../utils/fileUtils');

// Import-Datei anzeigen
router.get('/', async (req, res) => {
  try {
    const data = await loadImportFile();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Laden der Import-Datei', details: error.message });
  }
});

// Import-Datei leeren
router.delete('/', async (req, res) => {
  try {
    const data = await loadImportFile();
    const clearedCount = data.imports ? data.imports.length : 0;
    
    data.imports = [];
    await saveImportFile(data);
    
    res.json({ 
      message: 'Import-Datei geleert',
      clearedCount: clearedCount
    });
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Leeren der Import-Datei', details: error.message });
  }
});

module.exports = router;
