const express = require('express');
const router = express.Router();
const result = require('../utils/result');

// Health Check (keine Auth erforderlich)
router.get('/health', (req, res) => {
  const doc = result.documentation({
    method: 'GET',
    path: '/health',
    description: 'Health check endpoint to verify if the API is running.'
  });

  const message = result.message({
    docs: doc,
    message: 'API is healthy and running.',
    data: {
      status: 'ok', 
      timestamp: new Date().toISOString(),
      service: 'mucajey API'
    }
  });

  res.json(message);
});

module.exports = router;
