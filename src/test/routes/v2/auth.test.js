/* eslint-env jest */

const express = require('express');
const request = require('supertest');
const path = require('path');
const assert = require('node:assert/strict');

function deepCopy(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createUserStore(initial = []) {
  const store = initial.map(entry => ({ ...entry }));
  return {
    load: async () => deepCopy(store),
    save: async users => {
      store.splice(0, store.length, ...users.map(entry => ({ ...entry })));
      return deepCopy(store);
    },
    raw: store,
  };
}

function setGlobals({ store, bcryptImpl, canonical }) {
  const prev = {
    loadUsers: global.loadUsers,
    saveUsers: global.saveUsers,
    canonicalType: global.canonicalType,
    bcrypt: global.bcrypt,
  };

  global.loadUsers = () => store.load();
  global.saveUsers = users => store.save(users);
  global.canonicalType =
    canonical || (type => (type === 'admin' ? 'admin' : 'user'));
  global.bcrypt = bcryptImpl || {
    hash: async value => `hashed:${value}`,
    compare: async (candidate, hashed) => hashed === `hashed:${candidate}`,
  };

  return () => {
    global.loadUsers = prev.loadUsers;
    global.saveUsers = prev.saveUsers;
    global.canonicalType = prev.canonicalType;
    global.bcrypt = prev.bcrypt;
  };
}

function buildAuthApp({
  currentUser = null,
  store,
  bcryptImpl,
  canonical,
} = {}) {
  const cleanupGlobals = setGlobals({ store, bcryptImpl, canonical });
  const routerPath = path.join(__dirname, '../../../server/routes/v2/auth');
  delete require.cache[routerPath];
  const authRouter = require(routerPath);

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = currentUser;
    req.isAuthenticated = () => !!currentUser;
    next();
  });
  app.use('/auth', authRouter);
  app.use((err, _req, res) => res.status(500).json({ error: err.message }));

  const cleanup = () => {
    cleanupGlobals();
    delete require.cache[routerPath];
  };

  return { app, cleanup };
}

test('GET /auth/me requires authentication', async () => {
  const store = createUserStore();
  const { app, cleanup } = buildAuthApp({ currentUser: null, store });
  try {
    const res = await request(app).get('/auth/me').expect(401);
    assert.equal(res.body.error, 'Unauthorized');
  } finally {
    cleanup();
  }
});

test('GET /auth/me returns the current user when authenticated', async () => {
  const store = createUserStore();
  const currentUser = { username: 'alice', type: 'admin', apiKey: 'k1' };
  const { app, cleanup } = buildAuthApp({ currentUser, store });
  try {
    const res = await request(app).get('/auth/me').expect(200);
    assert.deepEqual(res.body.user, currentUser);
  } finally {
    cleanup();
  }
});

test('GET /auth/users returns all users for admins', async () => {
  const store = createUserStore([{ username: 'a' }, { username: 'b' }]);
  const currentUser = { username: 'admin', type: 'admin' };
  const { app, cleanup } = buildAuthApp({ currentUser, store });
  try {
    const res = await request(app).get('/auth/users').expect(200);
    assert.equal(res.body.users.length, 2);
  } finally {
    cleanup();
  }
});

test('POST /auth/users validates required fields and uniqueness', async () => {
  const store = createUserStore([
    { username: 'existing', password: 'hashed:pw', type: 'user' },
  ]);
  const currentUser = { username: 'admin', type: 'admin' };

  const { app, cleanup } = buildAuthApp({ currentUser, store });
  try {
    const missing = await request(app)
      .post('/auth/users')
      .send({ username: 'bob' })
      .expect(400);
    assert.equal(missing.body.error, 'username and password are required');

    const conflict = await request(app)
      .post('/auth/users')
      .send({ username: 'existing', password: 'pw' })
      .expect(409);
    assert.equal(conflict.body.error, 'User already exists');
  } finally {
    cleanup();
  }
});

test('POST /auth/users creates a user with hashed password', async () => {
  const store = createUserStore([]);
  const currentUser = { username: 'admin', type: 'admin' };
  const { app, cleanup } = buildAuthApp({ currentUser, store });
  try {
    const res = await request(app)
      .post('/auth/users')
      .send({ username: 'carol', password: 'pw', type: 'admin' })
      .expect(201);
    assert.equal(res.body.username, 'carol');
    assert.equal(store.raw.length, 1);
    assert.equal(store.raw[0].password, 'hashed:pw');
    assert.equal(store.raw[0].type, 'admin');
  } finally {
    cleanup();
  }
});

test('POST /auth/users/password enforces password rules for non-admins', async () => {
  const store = createUserStore([
    { username: 'dave', password: 'hashed:old', type: 'user' },
  ]);
  const currentUser = { username: 'dave', type: 'user' };
  const { app, cleanup } = buildAuthApp({ currentUser, store });
  try {
    const missing = await request(app)
      .post('/auth/users/password')
      .send({})
      .expect(400);
    assert.equal(missing.body.error, 'newPassword is required');

    const noCurrent = await request(app)
      .post('/auth/users/password')
      .send({ newPassword: 'new' })
      .expect(400);
    assert.equal(noCurrent.body.error, 'currentPassword is required');

    const invalid = await request(app)
      .post('/auth/users/password')
      .send({ currentPassword: 'wrong', newPassword: 'new' })
      .expect(401);
    assert.equal(invalid.body.error, 'Current password is invalid');
  } finally {
    cleanup();
  }
});

test('POST /auth/users/password updates password when checks pass', async () => {
  const store = createUserStore([
    { username: 'erin', password: 'hashed:old', type: 'user' },
  ]);
  const currentUser = { username: 'erin', type: 'user' };
  const { app, cleanup } = buildAuthApp({ currentUser, store });
  try {
    await request(app)
      .post('/auth/users/password')
      .send({ currentPassword: 'old', newPassword: 'newpw' })
      .expect(200);
    assert.equal(store.raw[0].password, 'hashed:newpw');
  } finally {
    cleanup();
  }
});

test('POST /auth/users/:username/password allows admins to reset passwords', async () => {
  const store = createUserStore([
    { username: 'frank', password: 'hashed:old', type: 'user' },
  ]);
  const currentUser = { username: 'admin', type: 'admin' };
  const { app, cleanup } = buildAuthApp({ currentUser, store });
  try {
    await request(app)
      .post('/auth/users/frank/password')
      .send({ password: 'reset' })
      .expect(200);
    assert.equal(store.raw[0].password, 'hashed:reset');
  } finally {
    cleanup();
  }
});

test('DELETE /auth/users/:username rejects self-deletion and deletes others', async () => {
  const store = createUserStore([
    { username: 'admin', type: 'admin' },
    { username: 'greg', type: 'user' },
  ]);
  const currentUser = { username: 'admin', type: 'admin' };
  const { app, cleanup } = buildAuthApp({ currentUser, store });
  try {
    const selfDelete = await request(app)
      .delete('/auth/users/admin')
      .expect(400);
    assert.equal(selfDelete.body.error, 'Admins cannot delete themselves');

    const missing = await request(app)
      .delete('/auth/users/unknown')
      .expect(404);
    assert.equal(missing.body.error, 'User not found');

    await request(app).delete('/auth/users/greg').expect(204);
    assert.equal(
      store.raw.find(u => u.username === 'greg'),
      undefined
    );
  } finally {
    cleanup();
  }
});

test('POST /auth/users/:username/password uses fallback storage when updateUser is absent', async () => {
  jest.resetModules();
  const users = [{ username: 'bob', password: 'hash', type: 'user' }];

  jest.doMock('../../../server/middleware/passport/local', () => ({
    ensureAuthenticated: (_req, _res, next) => next(),
    ensureAdmin: (_req, _res, next) => next(),
  }));

  jest.doMock('../../../server/middleware/mongo/cache.user', () => {
    const store = users;
    return {
      listUsers: async () => store.map(u => ({ ...u })),
      writeUsers: async updated => {
        store.splice(0, store.length, ...updated.map(u => ({ ...u })));
        return store;
      },
    };
  });

  let authRouter;
  jest.isolateModules(() => {
    authRouter = require('../../../server/routes/v2/auth');
  });

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { username: 'admin', type: 'admin' };
    req.isAuthenticated = () => true;
    next();
  });
  app.use('/auth', authRouter);

  const res = await request(app)
    .post('/auth/users/bob/password')
    .send({ password: 'new' })
    .expect(200);

  assert.equal(res.body.username, 'bob');
  assert.equal(users[0].username, 'bob');
  assert.notEqual(users[0].password, 'hash');
});

test('DELETE /auth/users/:username uses fallback removeUser when deleteUser is absent', async () => {
  jest.resetModules();
  const users = [
    { username: 'admin', type: 'admin' },
    { username: 'carol', type: 'user' },
  ];

  jest.doMock('../../../server/middleware/passport/local', () => ({
    ensureAuthenticated: (_req, _res, next) => next(),
    ensureAdmin: (_req, _res, next) => next(),
  }));

  jest.doMock('../../../server/middleware/mongo/cache.user', () => {
    const store = users;
    return {
      listUsers: async () => store.map(u => ({ ...u })),
      writeUsers: async updated => {
        store.splice(0, store.length, ...updated.map(u => ({ ...u })));
        return store;
      },
    };
  });

  let authRouter;
  jest.isolateModules(() => {
    authRouter = require('../../../server/routes/v2/auth');
  });

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { username: 'admin', type: 'admin' };
    req.isAuthenticated = () => true;
    next();
  });
  app.use('/auth', authRouter);

  await request(app).delete('/auth/users/carol').expect(204);
  assert.equal(
    users.find(u => u.username === 'carol'),
    undefined
  );
});

test('POST /auth/users stores non-admin type via canonicalType fallback', async () => {
  const store = createUserStore([]);
  const currentUser = { username: 'admin', type: 'admin' };
  const { app, cleanup } = buildAuthApp({ currentUser, store });
  try {
    const res = await request(app)
      .post('/auth/users')
      .send({ username: 'dave', password: 'pw', type: 'guest' })
      .expect(201);
    assert.equal(res.body.type, 'user');
    assert.equal(store.raw[0].type, 'user');
  } finally {
    cleanup();
  }
});

test('GET /auth/users forwards load errors', async () => {
  const store = {
    raw: [],
    load: async () => {
      throw new Error('fail-load');
    },
    save: async () => {},
  };
  const currentUser = { username: 'admin', type: 'admin' };
  const { app, cleanup } = buildAuthApp({ currentUser, store });
  try {
    const res = await request(app).get('/auth/users').expect(500);
    assert.equal(res.statusCode, 500);
  } finally {
    cleanup();
  }
});

test('POST /auth/users forwards load errors', async () => {
  const store = {
    raw: [],
    load: async () => {
      throw new Error('fail-load');
    },
    save: async () => {},
  };
  const currentUser = { username: 'admin', type: 'admin' };
  const { app, cleanup } = buildAuthApp({ currentUser, store });
  try {
    const res = await request(app)
      .post('/auth/users')
      .send({ username: 'x', password: 'y' })
      .expect(500);
    assert.equal(res.statusCode, 500);
  } finally {
    cleanup();
  }
});

test('POST /auth/users/password returns 404 when user missing', async () => {
  const store = createUserStore([]);
  const currentUser = { username: 'missing', type: 'user' };
  const { app, cleanup } = buildAuthApp({ currentUser, store });
  try {
    const res = await request(app)
      .post('/auth/users/password')
      .send({ currentPassword: 'old', newPassword: 'new' })
      .expect(404);
    assert.equal(res.body.error, 'User not found');
  } finally {
    cleanup();
  }
});

test('POST /auth/users/password forwards errors', async () => {
  const store = {
    raw: [],
    load: async () => {
      throw new Error('load-fail');
    },
    save: async () => {},
  };
  const currentUser = { username: 'any', type: 'admin' };
  const { app, cleanup } = buildAuthApp({ currentUser, store });
  try {
    const res = await request(app)
      .post('/auth/users/password')
      .send({ newPassword: 'pw' })
      .expect(500);
    assert.equal(res.statusCode, 500);
  } finally {
    cleanup();
  }
});

test('POST /auth/users/:username/password uses global updateUser when provided', async () => {
  const store = createUserStore([
    { username: 'bob', password: 'old', type: 'user' },
  ]);
  const currentUser = { username: 'admin', type: 'admin' };
  const { app, cleanup } = buildAuthApp({ currentUser, store });
  const prevUpdate = global.updateUser;
  global.updateUser = jest.fn(async () => ({
    username: 'bob',
    type: 'user',
    password: 'new',
  }));
  try {
    const res = await request(app)
      .post('/auth/users/bob/password')
      .send({ password: 'reset' })
      .expect(200);
    assert.equal(res.body.username, 'bob');
    assert.equal(global.updateUser.mock.calls.length, 1);
  } finally {
    global.updateUser = prevUpdate;
    cleanup();
  }
});

test('DELETE /auth/users/:username uses global deleteUser when provided', async () => {
  const store = createUserStore([
    { username: 'admin', type: 'admin' },
    { username: 'bob', type: 'user' },
  ]);
  const currentUser = { username: 'admin', type: 'admin' };
  const { app, cleanup } = buildAuthApp({ currentUser, store });
  const prevDelete = global.deleteUser;
  global.deleteUser = jest.fn(async () => {});
  try {
    await request(app).delete('/auth/users/bob').expect(204);
    assert.equal(global.deleteUser.mock.calls.length, 1);
  } finally {
    global.deleteUser = prevDelete;
    cleanup();
  }
});
