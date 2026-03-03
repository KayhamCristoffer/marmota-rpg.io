const admin = require('firebase-admin');

// ─── Verifica Firebase ID Token ──────────────────────────────────
const isAuth = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized - Token required' });
  }

  const idToken = header.split('Bearer ')[1];
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.user = decoded;          // uid, email, name, picture, etc.
    req.uid  = decoded.uid;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// ─── Verifica se é Admin (role no DB) ────────────────────────────
const isAdmin = async (req, res, next) => {
  try {
    const db   = admin.database();
    const snap = await db.ref(`rpg-quests/users/${req.uid}/role`).once('value');
    const role = snap.val();
    if (role === 'admin') return next();
    return res.status(403).json({ error: 'Forbidden - Admin only' });
  } catch (err) {
    return res.status(403).json({ error: 'Could not verify admin role' });
  }
};

module.exports = { isAuth, isAdmin };
