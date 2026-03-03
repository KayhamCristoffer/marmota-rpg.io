const admin = require('firebase-admin');

// ─── Estatísticas do usuário ─────────────────────────────────────
exports.getStats = async (req, res) => {
  try {
    const db  = admin.database();
    const uid = req.uid;

    const [userSnap, myQuestsSnap] = await Promise.all([
      db.ref(`rpg-quests/users/${uid}`).once('value'),
      db.ref(`rpg-quests/userQuests/${uid}`).once('value')
    ]);

    const user      = userSnap.val()      || {};
    const myQuests  = Object.values(myQuestsSnap.val() || {});

    const active         = myQuests.filter(q => q.status === 'active').length;
    const completed      = myQuests.filter(q => q.status === 'completed').length;
    const rejected       = myQuests.filter(q => q.status === 'rejected').length;
    const pendingReview  = myQuests.filter(q => q.status === 'pending_review').length;

    // XP para próximo nível
    const level        = user.level || 1;
    const xpForNext    = 100 * level;
    let   xpAccum      = user.xp || 0;
    for (let i = 1; i < level; i++) xpAccum -= 100 * i;
    const xpProgress   = Math.max(0, xpAccum);
    const xpPercent    = Math.min(100, Math.round((xpProgress / xpForNext) * 100));

    res.json({
      uid,
      username:     user.username     || 'Unknown',
      nickname:     user.nickname     || user.username || 'Unknown',
      photoURL:     user.photoURL     || '',
      coins:        user.coins        || 0,
      coinsDaily:   user.coinsDaily   || 0,
      coinsWeekly:  user.coinsWeekly  || 0,
      coinsMonthly: user.coinsMonthly || 0,
      xp:           user.xp           || 0,
      xpProgress,
      xpForNextLevel: xpForNext,
      xpPercent,
      level,
      role:         user.role         || 'user',
      badges:       user.badges       || [],
      quests: { active, completed, rejected, pending: pendingReview }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── Atualizar nickname ──────────────────────────────────────────
exports.updateNickname = async (req, res) => {
  try {
    const db  = admin.database();
    const { nickname } = req.body;
    if (!nickname || nickname.trim().length < 2)
      return res.status(400).json({ error: 'Nickname deve ter pelo menos 2 caracteres' });

    const nick = nickname.trim().slice(0, 32);
    await db.ref(`rpg-quests/users/${req.uid}`).update({ nickname: nick });

    // Atualizar nos rankings também
    await db.ref(`rpg-quests/ranking/total/${req.uid}/nickname`).set(nick);
    await db.ref(`rpg-quests/ranking/daily/${req.uid}/nickname`).set(nick);
    await db.ref(`rpg-quests/ranking/weekly/${req.uid}/nickname`).set(nick);
    await db.ref(`rpg-quests/ranking/monthly/${req.uid}/nickname`).set(nick);

    res.json({ message: 'Nickname atualizado! 🎉' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
