const express = require('express');
const router  = express.Router();
const admin   = require('firebase-admin');
const { isAuth } = require('../middleware/auth');

// ─── Registrar/atualizar usuário após login no Firebase ──────────
// Chamado pelo front após login bem-sucedido com Firebase Auth
router.post('/register', isAuth, async (req, res) => {
  try {
    const db   = admin.database();
    const uid  = req.uid;
    const { username, email, photoURL, provider } = req.body;

    const userRef  = db.ref(`rpg-quests/users/${uid}`);
    const snapshot = await userRef.once('value');

    const ADMIN_UID = process.env.ADMIN_UID || 'F69XMBOumJSiuBvQm3c63HyJAjy2';

    if (!snapshot.exists()) {
      // Novo usuário
      const newUser = {
        uid,
        email:        email || req.user.email || '',
        username:     username || req.user.name || 'Adventurer',
        nickname:     username || req.user.name || 'Adventurer',
        photoURL:     photoURL || req.user.picture || '',
        provider:     provider || 'google',
        coins:        0,
        coinsDaily:   0,
        coinsWeekly:  0,
        coinsMonthly: 0,
        xp:           0,
        level:        1,
        role:         uid === ADMIN_UID ? 'admin' : 'user',
        badges:       [],
        createdAt:    new Date().toISOString()
      };
      await userRef.set(newUser);
      console.log(`✨ New user: ${newUser.username} (${uid})`);
      return res.status(201).json(newUser);
    } else {
      // Usuário existente — atualiza dados do perfil
      const updates = {
        photoURL: photoURL || req.user.picture || snapshot.val().photoURL,
        username: username || req.user.name   || snapshot.val().username
      };
      await userRef.update(updates);
      const updated = { ...snapshot.val(), ...updates };
      return res.status(200).json(updated);
    }
  } catch (err) {
    console.error('auth/register error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Buscar dados do usuário logado ─────────────────────────────
router.get('/me', isAuth, async (req, res) => {
  try {
    const db   = admin.database();
    const snap = await db.ref(`rpg-quests/users/${req.uid}`).once('value');
    if (!snap.exists()) return res.status(404).json({ error: 'User not found' });
    res.json(snap.val());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
