const express = require('express');
const router = express.Router();
const bcrypt = global.bcrypt || require('bcryptjs');
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
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.json({
    user: {
      username: req.user.username,
      type: req.user.type,
      apiKey: req.user.apiKey,
    },
  });
});

router.get('/users', ensureAdmin, async (req, res, next) => {
  try {
    const users = await loadUsers();
    res.json({ users });
  } catch (error) {
    next(error);
  }
});

router.post('/users', ensureAdmin, async (req, res, next) => {
  const { username, password, type } = req.body ?? {};
  if (!username || !password) {
    return res
      .status(400)
      .json({ error: 'username and password are required' });
  }

  try {
    const users = await loadUsers();
    if (users.some(entry => entry.username === username)) {
      return res.status(409).json({ error: 'User already exists' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const updated = [
      ...users,
      { username, password: hashed, type: canonicalType(type), apiKey: '' },
    ];
    await saveUsers(updated);
    res.status(201).json({ username, type: canonicalType(type) });
  } catch (error) {
    next(error);
  }
});

router.post('/users/password', ensureAuthenticated, async (req, res, next) => {
  const { currentPassword, newPassword } = req.body ?? {};
  if (!newPassword) {
    return res.status(400).json({ error: 'newPassword is required' });
  }

  try {
    const users = await loadUsers();
    const index = users.findIndex(
      entry => entry.username === req.user.username
    );
    if (index === -1) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (req.user.type !== 'admin') {
      if (!currentPassword) {
        return res.status(400).json({ error: 'currentPassword is required' });
      }

      const matches = await bcrypt.compare(
        currentPassword,
        users[index].password
      );
      if (!matches) {
        return res.status(401).json({ error: 'Current password is invalid' });
      }
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await overwriteUser(req.user.username, { password: hashed });
    const refreshed = await loadUsers();
    const updatedUser = refreshed.find(u => u.username === req.user.username);
    res.json({ username: updatedUser.username, type: updatedUser.type });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/users/:username/password',
  ensureAdmin,
  async (req, res, next) => {
    const { username } = req.params;
    const { password } = req.body ?? {};
    if (!password) {
      return res.status(400).json({ error: 'password is required' });
    }

    try {
      const users = await loadUsers();
      const index = users.findIndex(entry => entry.username === username);
      if (index === -1) {
        return res.status(404).json({ error: 'User not found' });
      }

      const hashed = await bcrypt.hash(password, 10);
      await overwriteUser(username, { password: hashed });
      const refreshed = await loadUsers();
      const updatedUser = refreshed.find(u => u.username === username);
      res.json({ username: updatedUser.username, type: updatedUser.type });
    } catch (error) {
      next(error);
    }
  }
);

router.delete('/users/:username', ensureAdmin, async (req, res, next) => {
  const { username } = req.params;
  if (req.user?.username === username) {
    return res.status(400).json({ error: 'Admins cannot delete themselves' });
  }

  try {
    const users = await loadUsers();
    const exists = users.some(entry => entry.username === username);
    if (!exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    await removeUser(username);
    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
