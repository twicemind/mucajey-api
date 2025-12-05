/* eslint-env jest */
const { documentation, message, error } = require('../../server/utils/result');

describe('result utils', () => {
  test('documentation requires method and path and fills description', () => {
    const doc = documentation({
      method: 'GET',
      path: '/health',
      description: 'Health check',
    });
    expect(doc).toEqual({
      method: 'GET',
      path: '/health',
      description: 'Health check',
    });

    expect(() => documentation({ path: '/missing' })).toThrow(
      /method is required/
    );
    expect(() => documentation({ method: 'GET' })).toThrow(/path is required/);
  });

  test('message enforces docs/message and merges data', () => {
    const docs = { method: 'GET', path: '/health' };
    const msg = message({
      docs,
      message: 'ok',
      data: { status: 'ok' },
      notes: 'note',
    });

    expect(msg.docs).toBe(docs);
    expect(msg.message).toBe('ok');
    expect(msg.notes).toBe('note');
    expect(msg.status).toBe('ok');

    expect(() => message({ message: 'missing docs' })).toThrow(
      /Docs is required/
    );
    expect(() => message({ docs })).toThrow(/Message is required/);
  });

  test('error enforces docs/error and carries details', () => {
    const docs = { method: 'GET', path: '/fail' };
    const err = error({ docs, error: 'boom', details: 'stack' });

    expect(err.docs).toBe(docs);
    expect(err.error).toBe('boom');
    expect(err.details).toBe('stack');

    expect(() => error({ error: 'missing docs' })).toThrow(/Docs is required/);
    expect(() => error({ docs })).toThrow(/Error message is required/);
  });
});
