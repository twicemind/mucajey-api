const express = require('express');
const router = express.Router();
const { generateSecureApiKey, saveApiKeys, apiKeysStore } = require('../middleware/auth');

// API-Key generieren
router.post('/', async (req, res) => {
  try {
    const { appName, deviceId } = req.body;
    
    if (!appName) {
      return res.status(400).json({ error: 'appName ist erforderlich' });
    }
    
    const newApiKey = generateSecureApiKey();
    const timestamp = new Date().toISOString();
    
    const keyEntry = {
      key: newApiKey,
      appName: appName,
      deviceId: deviceId || 'unknown',
      createdAt: timestamp,
      lastUsed: null,
      active: true
    };
    
    apiKeysStore.keys.push(keyEntry);
    await saveApiKeys();

    res.status(201).json({
      message: 'API-Key erfolgreich generiert',
      apiKey: newApiKey,
      appName: appName,
      deviceId: deviceId,
      createdAt: timestamp
    });
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Generieren des API-Keys', details: error.message });
  }
});

module.exports = router;
