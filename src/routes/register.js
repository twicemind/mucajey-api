const express = require('express');
const router = express.Router();
const { generateSecureApiKey, saveApiKeys, apiKeysStore } = require('../middleware/auth');

// API-Key generieren
router.post('/', async (req, res) => {
  try {
    const { appName, deviceId, appVersion, platform } = req.body || {};

    if (!appName) {
      return res.status(400).json({ error: 'appName ist erforderlich' });
    }

    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId ist erforderlich' });
    }

    const timestamp = new Date().toISOString();
    const existingKey = apiKeysStore.keys.find(
      (entry) => entry.deviceId === deviceId && entry.appName === appName && entry.active
    );

    if (existingKey) {
      existingKey.lastUsed = timestamp;
      if (appVersion) {
        existingKey.appVersion = appVersion;
      }
      if (platform) {
        existingKey.platform = platform;
      }

      await saveApiKeys();

      return res.status(200).json({
        message: 'API-Key bereits registriert',
        apiKey: existingKey.key,
        appName,
        deviceId,
        appVersion: existingKey.appVersion ?? null,
        platform: existingKey.platform ?? null,
        createdAt: existingKey.createdAt,
        lastUsed: existingKey.lastUsed,
      });
    }

    const newApiKey = generateSecureApiKey();

    const keyEntry = {
      key: newApiKey,
      appName,
      appVersion: appVersion || null,
      deviceId,
      platform: platform || null,
      createdAt: timestamp,
      lastUsed: timestamp,
      active: true,
    };

    apiKeysStore.keys.push(keyEntry);
    await saveApiKeys();

    res.status(201).json({
      message: 'API-Key erfolgreich generiert',
      apiKey: newApiKey,
      appName,
      deviceId,
      appVersion: keyEntry.appVersion,
      platform: keyEntry.platform,
      createdAt: timestamp,
      lastUsed: timestamp,
    });
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Generieren des API-Keys', details: error.message });
  }
});

module.exports = router;
