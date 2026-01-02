const express = require('express');
const router = express.Router();
const bcrypt = global.bcrypt || require('bcryptjs');
const result = require('../../utils/result');
const {
  ensureAuthenticated,
  ensureAdmin,
} = require('../../middleware/passport/local');
const { listUsers, writeUsers } = require('../../middleware/mongo/cache.user');

const loadUsers = () =>
  typeof global.loadUsers === 'function' ? global.loadUsers() : listUsers();
const saveUsers = users =>
  typeof global.saveUsers === 'function'
    ? global.saveUsers(users)
    : writeUsers(users);
const overwriteUser = async (username, payload) => {
  if (typeof global.updateUser === 'function') {
    return global.updateUser(username, payload);
  }
  const users = await loadUsers();
  const idx = users.findIndex(u => u.username === username);
  if (idx === -1) return null;
  users[idx] = { ...users[idx], ...payload };
  await saveUsers(users);
  return users[idx];
};
const removeUser = async username => {
  if (typeof global.deleteUser === 'function') {
    return global.deleteUser(username);
  }
  const users = await loadUsers();
  const filtered = users.filter(u => u.username !== username);
  await saveUsers(filtered);
};

function canonicalType(type) {
  if (typeof global.canonicalType === 'function') {
    return global.canonicalType(type);
  }
  return type === 'admin' ? 'admin' : 'user';
}

router.get('/me', (req, res) => {
  const doc = result.documentation({
    method: 'GET',
    path: '/auth/me',
    description: 'Returns the current authenticated user.',
  });

  if (!req.isAuthenticated()) {
    return res
      .status(401)
      .json(result.error({ docs: doc, error: 'Unauthorized' }));
  }

  res.json(
    result.message({
      docs: doc,
      message: 'Authenticated user returned.',
      data: {
        user: {
          username: req.user.username,
          type: req.user.type,
          apiKey: req.user.apiKey,
        },
      },
    })
  );
});

router.get('/users', ensureAdmin, async (req, res, next) => {
  const doc = result.documentation({
    method: 'GET',
    path: '/auth/users',
    description: 'Lists every user allowed to access the admin area.',
  });

  try {
    const users = await loadUsers();
    res.json(
      result.message({
        docs: doc,
        message: 'Users retrieved.',
        data: { users },
      })
    );
  } catch (error) {
    next(error);
  }
});

router.post('/users', ensureAdmin, async (req, res, next) => {
  const doc = result.documentation({
    method: 'POST',
    path: '/auth/users',
    description: 'Creates a new user account for the admin area.',
  });

  const { username, password, type } = req.body ?? {};
  if (!username || !password) {
    return res
      .status(400)
      .json(
        result.error({
          docs: doc,
          error: 'username and password are required',
        })
      );
  }

  try {
    const users = await loadUsers();
    if (users.some(entry => entry.username === username)) {
      return res
        .status(409)
        .json(result.error({ docs: doc, error: 'User already exists' }));
    }

    const hashed = await bcrypt.hash(password, 10);
    const updated = [
      ...users,
      { username, password: hashed, type: canonicalType(type), apiKey: '' },
    ];
    await saveUsers(updated);
    return res
      .status(201)
      .json(
        result.message({
          docs: doc,
          message: 'User created.',
          data: { username, type: canonicalType(type) },
        })
      );
  } catch (error) {
    next(error);
  }
});

router.post('/users/password', ensureAuthenticated, async (req, res, next) => {
  const doc = result.documentation({
    method: 'POST',
    path: '/auth/users/password',
    description: 'Updates the authenticated user\'s password.',
  });

  const { currentPassword, newPassword } = req.body ?? {};
  if (!newPassword) {
    return res
      .status(400)
      .json(result.error({ docs: doc, error: 'newPassword is required' }));
  }

  try {
    const users = await loadUsers();
    const index = users.findIndex(
      entry => entry.username === req.user.username
    );
    if (index === -1) {
      return res
        .status(404)
        .json(result.error({ docs: doc, error: 'User not found' }));
    }

    if (req.user.type !== 'admin') {
      if (!currentPassword) {
        return res
          .status(400)
          .json(
            result.error({
              docs: doc,
              error: 'currentPassword is required',
            })
          );
      }

      const matches = await bcrypt.compare(
        currentPassword,
        users[index].password
      );
      if (!matches) {
        return res
          .status(401)
          .json(
            result.error({
              docs: doc,
              error: 'Current password is invalid',
            })
          );
      }
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await overwriteUser(req.user.username, { password: hashed });
    const refreshed = await loadUsers();
    const updatedUser = refreshed.find(u => u.username === req.user.username);
    res.json(
      result.message({
        docs: doc,
        message: 'Password updated.',
        data: { username: updatedUser.username, type: updatedUser.type },
      })
    );
  } catch (error) {
    next(error);
  }
});

router.post(
  '/users/:username/password',
  ensureAdmin,
  async (req, res, next) => {
    const doc = result.documentation({
      method: 'POST',
      path: '/auth/users/:username/password',
      description: 'Allows admins to reset another user\'s password.',
    });

    const { username } = req.params;
    const { password } = req.body ?? {};
    if (!password) {
      return res
        .status(400)
        .json(result.error({ docs: doc, error: 'password is required' }));
    }

    try {
      const users = await loadUsers();
      const index = users.findIndex(entry => entry.username === username);
      if (index === -1) {
        return res
          .status(404)
          .json(result.error({ docs: doc, error: 'User not found' }));
      }

      const hashed = await bcrypt.hash(password, 10);
      await overwriteUser(username, { password: hashed });
      const refreshed = await loadUsers();
      const updatedUser = refreshed.find(u => u.username === username);
      res.json(
        result.message({
          docs: doc,
          message: 'Password reset.',
          data: { username: updatedUser.username, type: updatedUser.type },
        })
      );
    } catch (error) {
      next(error);
    }
  }
);

router.delete('/users/:username', ensureAdmin, async (req, res, next) => {
  const doc = result.documentation({
    method: 'DELETE',
    path: '/auth/users/:username',
    description: 'Removes a user from the admin list.',
  });

  const { username } = req.params;
  if (req.user?.username === username) {
    return res
      .status(400)
      .json(
        result.error({
          docs: doc,
          error: 'Admins cannot delete themselves',
        })
      );
  }

  try {
    const users = await loadUsers();
    const exists = users.some(entry => entry.username === username);
    if (!exists) {
      return res
        .status(404)
        .json(result.error({ docs: doc, error: 'User not found' }));
    }

    await removeUser(username);
    res.json(
      result.message({
        docs: doc,
        message: 'User deleted.',
        data: { username },
      })
    );
  } catch (error) {
    next(error);
  }
});

module.exports = router;
