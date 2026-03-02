const User = require('../models/User');
const UserQuest = require('../models/UserQuest');

// ─── Estatísticas do usuário ─────────────────────────────────────
exports.getStats = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    const [active, completed, rejected, pending] = await Promise.all([
      UserQuest.countDocuments({ userId: user._id, status: 'active' }),
      UserQuest.countDocuments({ userId: user._id, status: 'completed' }),
      UserQuest.countDocuments({ userId: user._id, status: 'rejected' }),
      UserQuest.countDocuments({ userId: user._id, status: 'pending_review' })
    ]);

    // XP para próximo nível
    const xpForNextLevel = 100 * user.level;
    let xpProgress = user.xp;
    for (let i = 1; i < user.level; i++) xpProgress -= 100 * i;

    res.json({
      username: user.username,
      nickname: user.nickname || user.username,
      avatar: user.avatar,
      coins: user.coins,
      coinsDaily: user.coinsDaily,
      coinsWeekly: user.coinsWeekly,
      coinsMonthly: user.coinsMonthly,
      xp: user.xp,
      xpProgress: Math.max(0, xpProgress),
      xpForNextLevel,
      xpPercent: Math.min(100, Math.round((Math.max(0, xpProgress) / xpForNextLevel) * 100)),
      level: user.level,
      role: user.role,
      badges: user.badges,
      quests: { active, completed, rejected, pending }
    });
  } catch (err) {
    console.error('getStats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── Atualizar nickname ───────────────────────────────────────────
exports.updateNickname = async (req, res) => {
  try {
    const { nickname } = req.body;
    if (!nickname || nickname.trim().length < 2) {
      return res.status(400).json({ error: 'Nickname must be at least 2 characters' });
    }

    await User.findByIdAndUpdate(req.user._id, { nickname: nickname.trim().slice(0, 32) });
    res.json({ message: 'Nickname updated!' });
  } catch (err) {
    console.error('updateNickname error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
