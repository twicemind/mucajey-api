const express = require('express');
const result = require('../utils/result');
const { generateSecureApiKey, saveApiKeys, apiKeysStore } = require('../middleware/auth');

const router = express.Router();

const docDefinition = {
  method: 'POST',
  path: '/apple/login',
  description: 'Issue or return an API key for apps authenticated via Sign in with Apple.'
};

router.post('/login', async (req, res) => {
  const doc = result.documentation(docDefinition);
  const { appleUserId, deviceId, appName, appVersion, platform } = req.body || {};

  if (!appleUserId) {
    return res.status(400).json(result.error({ docs: doc, error: 'appleUserId is required' }));
  }
  if (!deviceId) {
    return res.status(400).json(result.error({ docs: doc, error: 'deviceId is required' }));
  }
  if (!appName) {
    return res.status(400).json(result.error({ docs: doc, error: 'appName is required' }));
  }

  const timestamp = new Date().toISOString();
  const existing = apiKeysStore.keys.find(
    (entry) => entry.appleUserId === appleUserId && entry.deviceId === deviceId && entry.active
  );

  if (existing) {
    existing.lastUsed = timestamp;
    if (appVersion) {
      existing.appVersion = appVersion;
    }
    if (platform) {
      existing.platform = platform;
    }

    await saveApiKeys();

    return res.json(
      result.message({
        docs: doc,
        message: 'API key already registered for this Apple user',
        data: {
          apiKey: existing.key,
          appName,
          deviceId,
          appleUserId,
          appVersion: existing.appVersion || null,
          platform: existing.platform || null,
          lastUsed: existing.lastUsed,
          status: 'existing'
        }
      })
    );
  }

  const newApiKey = generateSecureApiKey();
  const keyEntry = {
    key: newApiKey,
    appName,
    appVersion: appVersion || null,
    deviceId,
    platform: platform || 'iOS',
    appleUserId,
    createdAt: timestamp,
    lastUsed: timestamp,
    active: true
  };

  apiKeysStore.keys.push(keyEntry);
  await saveApiKeys();

  res.status(201).json(
    result.message({
      docs: doc,
      message: 'API key created via Apple login',
      data: {
        apiKey: newApiKey,
        appName,
        deviceId,
        appleUserId,
        appVersion: keyEntry.appVersion,
        platform: keyEntry.platform,
        createdAt: timestamp,
        lastUsed: timestamp,
        status: 'created'
      }
    })
  );
});

module.exports = router;