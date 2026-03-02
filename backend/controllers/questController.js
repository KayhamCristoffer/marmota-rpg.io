const Quest = require('../models/Quest');
const UserQuest = require('../models/UserQuest');
const upload = require('../middleware/upload');
const path = require('path');

// ─── Listar todas as quests disponíveis ──────────────────────────
exports.getAllQuests = async (req, res) => {
  try {
    const { type, status } = req.query;
    const filter = {};
    if (type && type !== 'all') filter.type = type;

    const quests = await Quest.find(filter).sort({ createdAt: -1 });

    // Para cada quest, verifica se o usuário já a pegou
    const userQuests = await UserQuest.find({ userId: req.user._id });
    const userQuestMap = {};
    userQuests.forEach(uq => {
      userQuestMap[uq.questId.toString()] = uq.status;
    });

    const questsWithStatus = quests.map(q => ({
      ...q.toJSON(),
      userStatus: userQuestMap[q._id.toString()] || null
    }));

    res.json(questsWithStatus);
  } catch (err) {
    console.error('getAllQuests error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── Quests do usuário ───────────────────────────────────────────
exports.getMyQuests = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = { userId: req.user._id };
    if (status && status !== 'all') filter.status = status;

    const myQuests = await UserQuest.find(filter)
      .populate('questId')
      .sort({ takenAt: -1 });

    res.json(myQuests);
  } catch (err) {
    console.error('getMyQuests error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── Pegar quest ─────────────────────────────────────────────────
exports.takeQuest = async (req, res) => {
  try {
    const quest = await Quest.findById(req.params.id);
    if (!quest) return res.status(404).json({ error: 'Quest not found' });
    if (!quest.isAvailable) return res.status(400).json({ error: 'Quest not available' });

    // Verifica nível mínimo
    if (req.user.level < quest.minLevel) {
      return res.status(400).json({ error: `Level ${quest.minLevel} required` });
    }

    // Verifica se já pegou
    const existing = await UserQuest.findOne({ userId: req.user._id, questId: quest._id });
    if (existing) return res.status(400).json({ error: 'Quest already taken' });

    const userQuest = await UserQuest.create({
      userId: req.user._id,
      questId: quest._id
    });

    // Incrementa contador de usuários
    quest.currentUsers += 1;
    await quest.save();

    res.status(201).json({ message: 'Quest taken successfully!', userQuest });
  } catch (err) {
    console.error('takeQuest error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── Enviar print da quest ────────────────────────────────────────
exports.submitQuest = async (req, res) => {
  upload.single('print')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });

    try {
      const userQuest = await UserQuest.findOne({
        _id: req.params.id,
        userId: req.user._id
      });

      if (!userQuest) return res.status(404).json({ error: 'Quest not found' });
      if (userQuest.status !== 'active') {
        return res.status(400).json({ error: 'Quest is not active' });
      }

      if (!req.file) return res.status(400).json({ error: 'Image is required' });

      const printUrl = `/uploads/${req.file.filename}`;
      userQuest.printUrl = printUrl;
      userQuest.status = 'pending_review';
      await userQuest.save();

      res.json({ message: 'Quest submitted for review!', printUrl });
    } catch (err) {
      console.error('submitQuest error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
};
