/* eslint-env jest */

const assert = require('node:assert/strict');

let capturedVerify;
const mockDone = jest.fn();

jest.mock('passport-headerapikey', () => ({
  HeaderAPIKeyStrategy: function Strategy(opts, passReq, verify) {
    this.opts = opts;
    this.passReq = passReq;
    capturedVerify = verify;
  },
}));

let mockIsValid;
jest.mock('../../../server/middleware/mucajey/auth', () => ({
  isValidApiKey: (...args) => mockIsValid(...args),
}));

const {
  apiKeyStrategy,
} = require('../../../server/middleware/passport/strategy.api');

test('apiKeyStrategy configures strategy and accepts valid keys', async () => {
  mockIsValid = jest.fn(async key => key === 'ok');
  const strategy = apiKeyStrategy();

  assert.equal(strategy.opts.header, 'X-API-Key');
  assert.equal(strategy.opts.prefix, '');
  assert.equal(strategy.passReq, false);

  await capturedVerify('ok', mockDone);
  assert.equal(mockIsValid.mock.calls.length, 1);
  assert.equal(mockIsValid.mock.calls[0][0], 'ok');
  assert.equal(mockDone.mock.calls[0][0], null);
  assert.deepEqual(mockDone.mock.calls[0][1], { apiKey: 'ok' });
});

test('apiKeyStrategy rejects invalid keys', async () => {
  mockIsValid = jest.fn(async () => false);
  mockDone.mockReset();

  await capturedVerify('bad', mockDone);
  assert.equal(mockDone.mock.calls[0][0], null);
  assert.equal(mockDone.mock.calls[0][1], false);
});

test('apiKeyStrategy forwards errors from isValidApiKey', async () => {
  const error = new Error('boom');
  mockIsValid = jest.fn(async () => {
    throw error;
  });
  mockDone.mockReset();

  await capturedVerify('err', mockDone);
  assert.equal(mockDone.mock.calls[0][0], error);
});
