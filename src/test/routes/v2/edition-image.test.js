/* eslint-env jest */

const assert = require('node:assert/strict');
const path = require('path');
const express = require('express');
const request = require('supertest');

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildApp(router) {
  const app = express();

  // Intercept res.sendFile so we don't touch the real filesystem.
  app.response.sendFile = function sendFile(filePath) {
    this.status(200);
    this.set('X-Sent-File', filePath);
    return this.send(`SENT:${filePath}`);
  };

  app.use('/edition/image', router);
  return app;
}

describe('edition-image router', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('GET /edition/image/:edition_id returns 404 when resolveEdition returns null', async () => {
    await jest.isolateModulesAsync(async () => {
      const routerPath =
        require.resolve('../../../server/routes/v2/edition-image');
      const resultPath = require.resolve('../../../server/utils/result');
      const editionUtilsPath =
        require.resolve('../../../server/routes/v2/edition-utils');

      // Mock local modules by absolute path (guaranteed to match router's require)
      jest.doMock(resultPath, () => ({
        documentation: jest.fn(() => ({ docs: 'DOCS' })),
        error: jest.fn(({ docs, error }) => ({ docs, error })),
      }));

      jest.doMock(editionUtilsPath, () => ({
        resolveEdition: jest.fn(async () => null),
        getEditionImageFilename: jest.fn(id => `${id}.png`),
        getEditionImagePath: jest.fn(id => `/images/${id}.png`),
      }));

      // fs + mime-types are imported by name, normal mock works
      jest.doMock('fs', () => ({ existsSync: jest.fn() }));
      jest.doMock('mime-types', () => ({ lookup: jest.fn() }));

      const router = require(routerPath);

      const app = buildApp(router);
      const res = await request(app)
        .get('/edition/image/hitster-de-classics')
        .expect(404);

      // verify mocked result module was actually used
      const result = require(resultPath);
      assert.equal(result.documentation.mock.calls.length, 1);
      assert.equal(result.error.mock.calls.length, 1);

      assert.equal(res.body.error, 'Edition edition_id not found.');
    });
  });

  test('GET /edition/image/:edition_id returns 404 when image file does not exist', async () => {
    await jest.isolateModulesAsync(async () => {
      const routerPath =
        require.resolve('../../../server/routes/v2/edition-image');
      const resultPath = require.resolve('../../../server/utils/result');
      const editionUtilsPath =
        require.resolve('../../../server/routes/v2/edition-utils');

      jest.doMock(resultPath, () => ({
        documentation: jest.fn(() => ({ docs: 'DOCS' })),
        error: jest.fn(({ docs, error }) => ({ docs, error })),
      }));

      jest.doMock(editionUtilsPath, () => ({
        resolveEdition: jest.fn(async (_req, id) => id),
        getEditionImageFilename: jest.fn(id => `${id}.png`),
        getEditionImagePath: jest.fn(id => `/images/${id}.png`),
      }));

      jest.doMock('fs', () => ({ existsSync: jest.fn(() => false) }));
      jest.doMock('mime-types', () => ({ lookup: jest.fn() }));

      const router = require(routerPath);
      const app = buildApp(router);

      const res = await request(app)
        .get('/edition/image/hitster-de-classics')
        .expect(404);

      const result = require(resultPath);
      assert.equal(result.error.mock.calls.length, 1);

      assert.match(
        res.body.error,
        /Edition image not found for hitster-de-classics\./
      );
      assert.match(
        res.body.error,
        /Expected hitster-de-classics\.png in \/images\./
      );
    });
  });

  test('GET /edition/image/:edition_id sends file with content-type and cache-control when image exists', async () => {
    await jest.isolateModulesAsync(async () => {
      const routerPath =
        require.resolve('../../../server/routes/v2/edition-image');
      const resultPath = require.resolve('../../../server/utils/result');
      const editionUtilsPath =
        require.resolve('../../../server/routes/v2/edition-utils');

      const editionId = 'hitster-de-classics';
      const filePath = path.join('/images', `${editionId}.jpg`);

      jest.doMock(resultPath, () => ({
        documentation: jest.fn(() => ({ docs: 'DOCS' })),
        error: jest.fn(({ docs, error }) => ({ docs, error })),
      }));

      jest.doMock(editionUtilsPath, () => ({
        resolveEdition: jest.fn(async (_req, id) => id),
        getEditionImageFilename: jest.fn(id => `${id}.jpg`),
        getEditionImagePath: jest.fn(() => filePath),
      }));

      jest.doMock('fs', () => ({ existsSync: jest.fn(() => true) }));
      jest.doMock('mime-types', () => ({
        lookup: jest.fn(() => 'image/jpeg'),
      }));

      const router = require(routerPath);
      const app = buildApp(router);

      const res = await request(app)
        .get(`/edition/image/${editionId}`)
        .expect(200);

      assert.ok(res.headers['content-type'].startsWith('image/jpeg'));
      assert.equal(res.headers['cache-control'], 'public, max-age=604800');
      assert.equal(res.headers['x-sent-file'], filePath);

      assert.ok(Buffer.isBuffer(res.body));
      assert.match(
        res.body.toString('utf8'),
        new RegExp(`^SENT:${escapeRegExp(filePath)}$`)
      );
    });
  });

  test('GET /edition/image/:edition_id defaults to image/png when mime lookup returns falsy', async () => {
    await jest.isolateModulesAsync(async () => {
      const routerPath =
        require.resolve('../../../server/routes/v2/edition-image');
      const resultPath = require.resolve('../../../server/utils/result');
      const editionUtilsPath =
        require.resolve('../../../server/routes/v2/edition-utils');

      const editionId = 'hitster-de-modern';
      const filePath = path.join('/images', `${editionId}.unknownext`);

      jest.doMock(resultPath, () => ({
        documentation: jest.fn(() => ({ docs: 'DOCS' })),
        error: jest.fn(({ docs, error }) => ({ docs, error })),
      }));

      jest.doMock(editionUtilsPath, () => ({
        resolveEdition: jest.fn(async (_req, id) => id),
        getEditionImageFilename: jest.fn(id => `${id}.unknownext`),
        getEditionImagePath: jest.fn(() => filePath),
      }));

      jest.doMock('fs', () => ({ existsSync: jest.fn(() => true) }));
      jest.doMock('mime-types', () => ({ lookup: jest.fn(() => false) }));

      const router = require(routerPath);
      const app = buildApp(router);

      const res = await request(app)
        .get(`/edition/image/${editionId}`)
        .expect(200);

      // Express may append charset in some cases, so use startsWith
      assert.ok(res.headers['content-type'].startsWith('image/png'));
      assert.equal(res.headers['cache-control'], 'public, max-age=604800');
      assert.equal(res.headers['x-sent-file'], filePath);
    });
  });
});
