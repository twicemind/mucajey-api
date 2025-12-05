function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized' });
}

function ensureAdmin(req, res, next) {
  if (!req.isAuthenticated() || req.user?.type !== 'admin') {
    return res.status(403).json({ error: 'Admins only' });
  }
  next();
}

module.exports = {
  ensureAuthenticated,
  ensureAdmin,
};
