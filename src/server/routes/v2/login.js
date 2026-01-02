const express = require('express');
const router = express.Router();
const passport = require('passport');
const result = require('../../utils/result');

router.post('/login', (req, res, next) => {
  const doc = result.documentation({
    method: 'POST',
    path: '/login',
    description: 'Authenticates a user with their username and password.',
  });

  passport.authenticate('local', (error, user, info) => {
    if (error) {
      return next(error);
    }

    if (!user) {
      const errorMessage = result.error({
        docs: doc,
        error: info?.message ?? 'Invalid credentials',
      });
      return res.status(401).json(errorMessage);
    }

    req.logIn(user, loginError => {
      if (loginError) {
        const errorMessage = result.error({
          docs: doc,
          error: loginError.message,
        });
        return res.status(500).json(errorMessage);
      }

      const response = result.message({
        docs: doc,
        message: 'User authenticated successfully.',
        data: {
          user: {
            username: user.username,
            type: user.type,
            apiKey: user.apiKey,
          },
        },
      });

      res.json(response);
    });
  })(req, res, next);
});

router.post('/logout', (req, res) => {
  const doc = result.documentation({
    method: 'POST',
    path: '/logout',
    description: 'Invalidates the current authentication session.',
  });

  const sendSuccess = () =>
    res.json(
      result.message({
        docs: doc,
        message: 'User logged out successfully.',
      })
    );

  req.logout(logoutError => {
    if (logoutError) {
      const errorMessage = result.error({
        docs: doc,
        error: logoutError.message,
      });
      return res.status(500).json(errorMessage);
    }

    if (req.session) {
      req.session.destroy(sessionError => {
        if (sessionError) {
          const errorMessage = result.error({
            docs: doc,
            error: sessionError.message,
          });
          return res.status(500).json(errorMessage);
        }

        sendSuccess();
      });
      return;
    }

    sendSuccess();
  });
});

module.exports = router;
