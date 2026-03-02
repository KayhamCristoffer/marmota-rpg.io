const express = require('express');
const passport = require('passport');
const router = express.Router();

// ─── Login com Discord ────────────────────────────────────────────
router.get('/discord', passport.authenticate('discord'));

// ─── Callback do Discord ─────────────────────────────────────────
router.get('/discord/callback',
  passport.authenticate('discord', { failureRedirect: '/?error=auth_failed' }),
  (req, res) => {
    res.redirect('/home.html');
  }
);

// ─── Logout ──────────────────────────────────────────────────────
router.get('/logout', (req, res) => {
  req.logout(err => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    req.session.destroy();
    res.redirect('/');
  });
});

// ─── Dados do usuário logado ─────────────────────────────────────
router.get('/me', (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const { discordId, username, nickname, avatar, coins, xp, level, role, badges, coinsDaily, coinsWeekly, coinsMonthly } = req.user;
  res.json({ discordId, username, nickname, avatar, coins, xp, level, role, badges, coinsDaily, coinsWeekly, coinsMonthly });
});

module.exports = router;
