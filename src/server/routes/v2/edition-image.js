const express = require('express');
const fs = require('fs');
const mime = require('mime-types');
const {
  documentation: documentEndpoint,
  error: createError,
} = require('../../utils/result');
const {
  resolveEdition,
  getEditionImageFilename,
  getEditionImagePath,
} = require('./edition-utils');

const router = express.Router();

router.get('/:edition_id', async (req, res) => {
  const doc = documentEndpoint({
    method: 'GET',
    path: '/edition/image/:edition_id',
    description: 'Delivers the edition image as binary (png/jpg/...).',
  });

  const edition_id = await resolveEdition(req, req.params.edition_id);
  if (!edition_id) {
    const errorMessage = createError({
      docs: doc,
      error: 'Edition edition_id not found.',
    });
    return res.status(404).json(errorMessage);
  }

  const filePath = getEditionImagePath(edition_id);
  if (!fs.existsSync(filePath)) {
    const errorMessage = createError({
      docs: doc,
      error: `Edition image not found for ${edition_id}. Expected ${getEditionImageFilename(edition_id)} in /images.`,
    });
    return res.status(404).json(errorMessage);
  }

  const contentType = mime.lookup(filePath) || 'image/png';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'public, max-age=604800');

  return res.sendFile(filePath);
});

module.exports = router;
