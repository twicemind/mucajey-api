const express = require('express');
const router = express.Router();
const passport = require('passport');

router.post('/login', (req, res, next) => {
  passport.authenticate('local', (error, user, info) => {
    if (error) {
      return next(error);
    }
    if (!user) {
      return res
        .status(401)
        .json({ error: info?.message ?? 'Invalid credentials' });
    }

    req.logIn(user, loginError => {
      if (loginError) {
        return res.status(500).json({ error: loginError.message });
      }
      res.json({
        user: { username: user.username, type: user.type, apiKey: user.apiKey },
      });
    });
  })(req, res, next);
});

router.post('/logout', (req, res) => {
  req.logout(error => {
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    if (req.session) {
      req.session.destroy(() => res.sendStatus(204));
    } else {
      res.sendStatus(204);
    }
  });
});

module.exports = router;
