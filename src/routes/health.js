const express = require('express');
const router = express.Router();

// Health Check (keine Auth erforderlich)
router.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'mucajey API'
  });
});

module.exports = router;
