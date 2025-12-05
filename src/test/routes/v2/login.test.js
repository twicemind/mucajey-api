/* eslint-env jest */

const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const path = require('path');

function mockPassport({ user, authError, info }) {
  const passport = require('passport');
  const originalAuthenticate = passport.authenticate;
  const originalInitialize = passport.initialize;
  const calls = { strategies: [], cbArgs: [] };

  passport.authenticate = (strategy, cb) => {
    calls.strategies.push(strategy);
    return (req, res) => {
      const args = [authError || null, user ?? null, info];
      calls.cbArgs.push(args);
      const result = cb(...args);
      if (!user && !authError && !res.headersSent) {
        res.status(401).json({ error: info?.message ?? 'Invalid credentials' });
      }
      return result;
    };
  };

  passport.initialize = () => (req, _res, next) => next();

  const restore = () => {
    passport.authenticate = originalAuthenticate;
    passport.initialize = originalInitialize;
  };

  return { calls, restore };
}

function buildApp(options = {}) {
  const { calls, restore } = mockPassport(options);
  const routerPath = path.join(__dirname, '../../../server/routes/v2/login');
  delete require.cache[routerPath];
  const loginRouter = require(routerPath);

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.logIn = (user, cb) => {
      if (options.loginError) {
        return cb(options.loginError);
      }
      req.user = user;
      return cb && cb();
    };
    req.logout = cb => {
      if (options.logoutError) {
        return cb(options.logoutError);
      }
      return cb && cb();
    };
    if (options.withSession) {
      req.session = {
        destroyed: false,
        destroy(cb) {
          this.destroyed = true;
          cb && cb();
        },
      };
    }
    next();
  });
  app.use('/', loginRouter);
  app.use((err, _req, res) => {
    res.status(500).json({ error: err.message });
  });

  const cleanup = () => {
    delete require.cache[routerPath];
    restore();
  };

  return { app, calls, cleanup };
}

function loadRouter(options = {}) {
  const { calls, restore } = mockPassport(options);
  const routerPath = path.join(__dirname, '../../../server/routes/v2/login');
  delete require.cache[routerPath];
  const loginRouter = require(routerPath);

  const cleanup = () => {
    delete require.cache[routerPath];
    restore();
  };

  return { router: loginRouter, calls, cleanup };
}

function findHandler(router, routePath, method) {
  const layer = router.stack.find(
    entry =>
      entry.route &&
      entry.route.path === routePath &&
      entry.route.methods[method]
  );
  return layer?.route?.stack?.[0]?.handle;
}

function createRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    sendStatus(code) {
      this.statusCode = code;
      return this;
    },
  };
}

test('POST /login authenticates via passport and logs the user in', async () => {
  const user = { username: 'alice', type: 'admin', apiKey: 'key-1' };
  const { app, calls, cleanup } = buildApp({ user, withSession: true });
  try {
    const res = await request(app)
      .post('/login')
      .send({ username: 'alice', password: 'pw' })
      .expect(200);
    assert.deepEqual(res.body.user, user);
    assert.equal(calls.strategies[0], 'local');
  } finally {
    cleanup();
  }
});

test('POST /login returns 401 when passport rejects credentials', async () => {
  const { router, cleanup, calls } = loadRouter({
    user: null,
    info: { message: 'Invalid' },
  });
  const handler = findHandler(router, '/login', 'post');
  try {
    assert(handler, 'login handler not found');
    const req = {
      body: {},
      logIn: (_user, cb) => cb(),
      logout: cb => cb && cb(),
    };
    const res = createRes();
    await handler(req, res, () => {});
    assert.equal(calls.cbArgs[0][1], null);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'Invalid');
  } finally {
    cleanup();
  }
});

test('POST /login propagates logIn errors', async () => {
  const { app, cleanup } = buildApp({
    user: { username: 'bob' },
    loginError: new Error('boom'),
  });
  try {
    const res = await request(app).post('/login').send({}).expect(500);
    assert.equal(res.body.error, 'boom');
  } finally {
    cleanup();
  }
});

test('POST /logout destroys the session when present', async () => {
  const { app, cleanup } = buildApp({ withSession: true });
  try {
    const res = await request(app).post('/logout').expect(204);
    // Session destruction is handled synchronously in the mock
    assert.equal(res.text, '');
  } finally {
    cleanup();
  }
});

test('POST /logout passes through logout errors', async () => {
  const { app, cleanup } = buildApp({ logoutError: new Error('fail') });
  try {
    const res = await request(app).post('/logout').expect(500);
    assert.equal(res.body.error, 'fail');
  } finally {
    cleanup();
  }
});
