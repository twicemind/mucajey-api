const express = require('express');
const router = express.Router();
const { generateSecureApiKey, saveApiKeys, apiKeysStore } = require('../middleware/auth');
const result = require('../utils/result');

const registerRouteDocs = {
  root: {
    method: 'POST',
    path: '/api/register',
    description: 'Issue or return an API key tied to the provided application details.'
  }
};

// API-Key registration
router.post('/', async (req, res) => {
  const doc = result.documentation({
    method: 'POST',
    path: '/api/register',
    description: 'Issue or return an API key tied to the provided application details.'
  });

  try {
    const { appName, deviceId, appVersion, platform } = req.body || {};

    if (!appName) {
      const errorMessage = result.error({
        docs: doc,
        error: 'appName is required'
      });
      return res.status(400).json(errorMessage);
    }

    if (!deviceId) {
      const errorMessage = result.error({
        docs: doc,
        error: 'deviceId is required'
      });
      return res.status(400).json(errorMessage);
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

      const message = result.message({
        docs: doc,
        message: 'API key already registered',
        data: {
          apiKey: existingKey.key,
          appName,
          deviceId,
          appVersion: existingKey.appVersion ?? null,
          platform: existingKey.platform ?? null,
          createdAt: existingKey.createdAt,
          lastUsed: existingKey.lastUsed,
        }
      });

      return res.status(200).json(message);
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
      docs: registerRouteDocs.root,
      message: 'API key successfully generated',
      apiKey: newApiKey,
      appName,
      deviceId,
      appVersion: keyEntry.appVersion,
      platform: keyEntry.platform,
      createdAt: timestamp,
      lastUsed: timestamp,
    });
  } catch (error) {
    const errorMessage = result.error({
      docs: registerRouteDocs.root,
      error: 'Failed to generate API key',
      details: error.message
    });
    res.status(500).json(errorMessage);
  }
});

module.exports = router;
