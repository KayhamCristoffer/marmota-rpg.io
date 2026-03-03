const admin = require('firebase-admin');

// ─── Buscar ranking ──────────────────────────────────────────────
exports.getRanking = async (req, res) => {
  try {
    const db = admin.database();
    const { period = 'total', limit = 50 } = req.query;
    const uid = req.uid;

    // Buscar todos os usuários ordenados por moedas do período
    const usersSnap = await db.ref('rpg-quests/users').once('value');
    const users     = Object.values(usersSnap.val() || {});

    const coinField = {
      total:   'coins',
      daily:   'coinsDaily',
      weekly:  'coinsWeekly',
      monthly: 'coinsMonthly'
    }[period] || 'coins';

    const sorted = users
      .sort((a, b) => (b[coinField] || 0) - (a[coinField] || 0))
      .slice(0, parseInt(limit))
      .map((u, i) => ({
        position:     i + 1,
        uid:          u.uid,
        username:     u.username    || 'Unknown',
        nickname:     u.nickname    || u.username || 'Unknown',
        photoURL:     u.photoURL    || '',
        coins:        u[coinField]  || 0,
        level:        u.level       || 1,
        badges:       u.badges      || [],
        isCurrentUser: u.uid === uid
      }));

    // Posição do usuário atual se não estiver no top
    const inTop = sorted.find(r => r.isCurrentUser);
    let myPosition = null;
    if (!inTop) {
      const allSorted = users.sort((a, b) => (b[coinField] || 0) - (a[coinField] || 0));
      myPosition = allSorted.findIndex(u => u.uid === uid) + 1;
    }

    res.json({ ranking: sorted, myPosition, period });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── Reset diário ────────────────────────────────────────────────
exports.resetDailyRanking = async (db) => {
  try {
    const snap  = await db.ref('rpg-quests/users').once('value');
    const users = snap.val() || {};
    const updates = {};
    Object.keys(users).forEach(uid => { updates[`rpg-quests/users/${uid}/coinsDaily`] = 0; });
    await db.ref().update(updates);
    await db.ref('rpg-quests/meta/lastResetDaily').set(new Date().toISOString());
    console.log('✅ Daily ranking reset');
  } catch (err) {
    console.error('resetDailyRanking error:', err);
  }
};

// ─── Reset semanal ────────────────────────────────────────────────
exports.resetWeeklyRanking = async (db) => {
  try {
    const snap  = await db.ref('rpg-quests/users').once('value');
    const users = snap.val() || {};
    const updates = {};
    Object.keys(users).forEach(uid => { updates[`rpg-quests/users/${uid}/coinsWeekly`] = 0; });
    await db.ref().update(updates);
    await db.ref('rpg-quests/meta/lastResetWeekly').set(new Date().toISOString());
    console.log('✅ Weekly ranking reset');
  } catch (err) {
    console.error('resetWeeklyRanking error:', err);
  }
};

// ─── Reset mensal ─────────────────────────────────────────────────
exports.resetMonthlyRanking = async (db) => {
  try {
    const snap  = await db.ref('rpg-quests/users').once('value');
    const users = snap.val() || {};
    const updates = {};
    Object.keys(users).forEach(uid => { updates[`rpg-quests/users/${uid}/coinsMonthly`] = 0; });
    await db.ref().update(updates);
    await db.ref('rpg-quests/meta/lastResetMonthly').set(new Date().toISOString());
    console.log('✅ Monthly ranking reset');
  } catch (err) {
    console.error('resetMonthlyRanking error:', err);
  }
};
