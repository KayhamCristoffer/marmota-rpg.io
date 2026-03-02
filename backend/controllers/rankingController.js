const User = require('../models/User');
const Ranking = require('../models/Ranking');

// ─── Buscar ranking ──────────────────────────────────────────────
exports.getRanking = async (req, res) => {
  try {
    const { period = 'total', limit = 50 } = req.query;

    let sortField;
    switch (period) {
      case 'daily':   sortField = 'coinsDaily';   break;
      case 'weekly':  sortField = 'coinsWeekly';  break;
      case 'monthly': sortField = 'coinsMonthly'; break;
      default:        sortField = 'coins';         break;
    }

    const users = await User.find({})
      .select(`username nickname avatar ${sortField} level badges`)
      .sort({ [sortField]: -1 })
      .limit(parseInt(limit));

    const ranking = users.map((u, index) => ({
      position: index + 1,
      userId: u._id,
      username: u.username,
      nickname: u.nickname || u.username,
      avatar: u.avatar,
      coins: u[sortField] || 0,
      level: u.level,
      badges: u.badges,
      isCurrentUser: u._id.toString() === req.user._id.toString()
    }));

    // Posição do usuário atual se não estiver no top
    const currentUserPosition = ranking.find(r => r.isCurrentUser);
    let myPosition = null;
    if (!currentUserPosition) {
      const allUsers = await User.find({}).sort({ [sortField]: -1 }).select('_id');
      myPosition = allUsers.findIndex(u => u._id.toString() === req.user._id.toString()) + 1;
    }

    res.json({ ranking, myPosition, period });
  } catch (err) {
    console.error('getRanking error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── Reset diário ────────────────────────────────────────────────
exports.resetDailyRanking = async () => {
  try {
    await User.updateMany({}, { $set: { coinsDaily: 0 } });
    console.log('✅ Daily ranking reset');
  } catch (err) {
    console.error('resetDailyRanking error:', err);
  }
};

// ─── Reset semanal ───────────────────────────────────────────────
exports.resetWeeklyRanking = async () => {
  try {
    await User.updateMany({}, { $set: { coinsWeekly: 0 } });
    console.log('✅ Weekly ranking reset');
  } catch (err) {
    console.error('resetWeeklyRanking error:', err);
  }
};

// ─── Reset mensal ────────────────────────────────────────────────
exports.resetMonthlyRanking = async () => {
  try {
    await User.updateMany({}, { $set: { coinsMonthly: 0 } });
    console.log('✅ Monthly ranking reset');
  } catch (err) {
    console.error('resetMonthlyRanking error:', err);
  }
};
