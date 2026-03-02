const Quest = require('../models/Quest');
const User = require('../models/User');
const UserQuest = require('../models/UserQuest');
const { resetDailyRanking, resetWeeklyRanking, resetMonthlyRanking } = require('./rankingController');

// ─── Quests (admin view) ──────────────────────────────────────────
exports.getAllQuestsAdmin = async (req, res) => {
  try {
    const quests = await Quest.find({}).populate('createdBy', 'username').sort({ createdAt: -1 });
    res.json(quests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createQuest = async (req, res) => {
  try {
    const { title, description, type, rewardCoins, rewardXP, maxUsers, minLevel, expiresAt, imageRequired, eventName } = req.body;
    const quest = await Quest.create({
      title, description, type,
      rewardCoins: parseInt(rewardCoins),
      rewardXP: parseInt(rewardXP) || 0,
      maxUsers: maxUsers ? parseInt(maxUsers) : null,
      minLevel: parseInt(minLevel) || 1,
      expiresAt: expiresAt || null,
      imageRequired: imageRequired !== false,
      eventName: eventName || null,
      createdBy: req.user._id
    });
    res.status(201).json({ message: 'Quest created!', quest });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateQuest = async (req, res) => {
  try {
    const quest = await Quest.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!quest) return res.status(404).json({ error: 'Quest not found' });
    res.json({ message: 'Quest updated!', quest });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteQuest = async (req, res) => {
  try {
    await Quest.findByIdAndDelete(req.params.id);
    res.json({ message: 'Quest deleted!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.toggleQuest = async (req, res) => {
  try {
    const quest = await Quest.findById(req.params.id);
    if (!quest) return res.status(404).json({ error: 'Quest not found' });
    quest.isActive = !quest.isActive;
    await quest.save();
    res.json({ message: `Quest ${quest.isActive ? 'activated' : 'deactivated'}`, isActive: quest.isActive });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── Submissions pendentes ───────────────────────────────────────
exports.getPendingSubmissions = async (req, res) => {
  try {
    const submissions = await UserQuest.find({ status: 'pending_review' })
      .populate('userId', 'username nickname avatar')
      .populate('questId', 'title rewardCoins rewardXP type')
      .sort({ takenAt: -1 });
    res.json(submissions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.approveSubmission = async (req, res) => {
  try {
    const userQuest = await UserQuest.findById(req.params.id).populate('questId');
    if (!userQuest) return res.status(404).json({ error: 'Submission not found' });
    if (userQuest.status !== 'pending_review') {
      return res.status(400).json({ error: 'Submission already reviewed' });
    }

    userQuest.status = 'completed';
    userQuest.reviewedBy = req.user._id;
    userQuest.reviewedAt = new Date();
    userQuest.completedAt = new Date();
    await userQuest.save();

    // Adiciona recompensa ao usuário
    const user = await User.findById(userQuest.userId);
    await user.addReward(userQuest.questId.rewardCoins, userQuest.questId.rewardXP);

    res.json({ message: `Approved! +${userQuest.questId.rewardCoins} coins awarded.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.rejectSubmission = async (req, res) => {
  try {
    const { note } = req.body;
    const userQuest = await UserQuest.findById(req.params.id);
    if (!userQuest) return res.status(404).json({ error: 'Submission not found' });

    userQuest.status = 'rejected';
    userQuest.reviewedBy = req.user._id;
    userQuest.reviewedAt = new Date();
    userQuest.reviewNote = note || 'Rejected by admin';
    await userQuest.save();

    res.json({ message: 'Submission rejected.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── Usuários ────────────────────────────────────────────────────
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find({}).select('-__v').sort({ coins: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateUserRole = async (req, res) => {
  try {
    const { role } = req.body;
    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    await User.findByIdAndUpdate(req.params.id, { role });
    res.json({ message: `User role updated to ${role}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── Reset manual de ranking ─────────────────────────────────────
exports.manualResetRanking = async (req, res) => {
  try {
    const { period } = req.body;
    switch (period) {
      case 'daily':   await resetDailyRanking(); break;
      case 'weekly':  await resetWeeklyRanking(); break;
      case 'monthly': await resetMonthlyRanking(); break;
      default: return res.status(400).json({ error: 'Invalid period' });
    }
    res.json({ message: `${period} ranking reset successfully!` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
