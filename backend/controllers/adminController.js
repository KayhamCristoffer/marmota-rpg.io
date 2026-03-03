const admin = require('firebase-admin');

// ─── Listar todas as quests (admin) ──────────────────────────────
exports.getAllQuests = async (req, res) => {
  try {
    const db   = admin.database();
    const snap = await db.ref('rpg-quests/quests').once('value');
    const data = snap.val() || {};
    res.json(Object.values(data).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── Criar quest ─────────────────────────────────────────────────
exports.createQuest = async (req, res) => {
  try {
    const db  = admin.database();
    const ref = db.ref('rpg-quests/quests').push();
    const id  = ref.key;

    const quest = {
      id,
      title:         req.body.title,
      description:   req.body.description,
      type:          req.body.type,
      rewardCoins:   parseInt(req.body.rewardCoins)  || 0,
      rewardXP:      parseInt(req.body.rewardXP)     || 0,
      maxUsers:      req.body.maxUsers ? parseInt(req.body.maxUsers) : null,
      currentUsers:  0,
      minLevel:      parseInt(req.body.minLevel)     || 1,
      imageRequired: req.body.imageRequired !== false,
      isActive:      true,
      eventName:     req.body.eventName  || null,
      expiresAt:     req.body.expiresAt  || null,
      createdBy:     req.uid,
      createdAt:     new Date().toISOString()
    };

    await ref.set(quest);
    res.status(201).json({ message: 'Quest criada!', quest });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── Editar quest ─────────────────────────────────────────────────
exports.updateQuest = async (req, res) => {
  try {
    const db  = admin.database();
    const ref = db.ref(`rpg-quests/quests/${req.params.id}`);
    const snap = await ref.once('value');
    if (!snap.exists()) return res.status(404).json({ error: 'Quest não encontrada' });

    const updates = { ...req.body };
    if (updates.rewardCoins) updates.rewardCoins = parseInt(updates.rewardCoins);
    if (updates.rewardXP)    updates.rewardXP    = parseInt(updates.rewardXP);
    if (updates.maxUsers)    updates.maxUsers    = parseInt(updates.maxUsers);
    if (updates.minLevel)    updates.minLevel    = parseInt(updates.minLevel);
    delete updates.id; // não permitir mudar o id

    await ref.update(updates);
    res.json({ message: 'Quest atualizada!', id: req.params.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── Deletar quest ────────────────────────────────────────────────
exports.deleteQuest = async (req, res) => {
  try {
    const db = admin.database();
    await db.ref(`rpg-quests/quests/${req.params.id}`).remove();
    res.json({ message: 'Quest deletada!' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── Toggle ativo/inativo ─────────────────────────────────────────
exports.toggleQuest = async (req, res) => {
  try {
    const db   = admin.database();
    const ref  = db.ref(`rpg-quests/quests/${req.params.id}/isActive`);
    const snap = await ref.once('value');
    const newVal = !snap.val();
    await ref.set(newVal);
    res.json({ message: `Quest ${newVal ? 'ativada' : 'desativada'}!`, isActive: newVal });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── Submissions pendentes ────────────────────────────────────────
exports.getPendingSubmissions = async (req, res) => {
  try {
    const db   = admin.database();
    const snap = await db.ref('rpg-quests/submissions').orderByChild('status').equalTo('pending_review').once('value');
    const data = snap.val() || {};
    const list = Object.values(data).sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt));
    res.json(list);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── Aprovar submission ───────────────────────────────────────────
exports.approveSubmission = async (req, res) => {
  try {
    const db    = admin.database();
    const subId = req.params.id;

    const subSnap = await db.ref(`rpg-quests/submissions/${subId}`).once('value');
    if (!subSnap.exists()) return res.status(404).json({ error: 'Submission não encontrada' });
    const sub = subSnap.val();
    if (sub.status !== 'pending_review') return res.status(400).json({ error: 'Já foi revisada' });

    const now = new Date().toISOString();

    // 1. Atualizar submission
    await db.ref(`rpg-quests/submissions/${subId}`).update({
      status: 'completed', reviewedBy: req.uid, reviewedAt: now
    });

    // 2. Atualizar userQuest
    await db.ref(`rpg-quests/userQuests/${sub.userId}/${sub.questId}`).update({
      status: 'completed', completedAt: now, reviewedAt: now, reviewedBy: req.uid
    });

    // 3. Adicionar recompensa ao usuário + XP + Level
    const userRef  = db.ref(`rpg-quests/users/${sub.userId}`);
    const userSnap = await userRef.once('value');
    const user     = userSnap.val() || {};

    const newCoins        = (user.coins        || 0) + sub.rewardCoins;
    const newCoinsDaily   = (user.coinsDaily   || 0) + sub.rewardCoins;
    const newCoinsWeekly  = (user.coinsWeekly  || 0) + sub.rewardCoins;
    const newCoinsMonthly = (user.coinsMonthly || 0) + sub.rewardCoins;
    const newXP           = (user.xp           || 0) + (sub.rewardXP || 0);

    // Calcular nível
    let level = 1, xpLeft = newXP;
    while (xpLeft >= 100 * level) { xpLeft -= 100 * level; level++; }

    // Verificar badges
    const completedSnap = await db.ref(`rpg-quests/userQuests/${sub.userId}`).once('value');
    const allQuests     = Object.values(completedSnap.val() || {});
    const completedCount = allQuests.filter(q => q.status === 'completed').length;

    const currentBadges = user.badges || [];
    const newBadges     = [...currentBadges];
    const badgeMap = [
      { count: 1,   badge: 'first_quest' },
      { count: 10,  badge: 'bronze' },
      { count: 50,  badge: 'silver' },
      { count: 100, badge: 'gold' },
      { count: 250, badge: 'diamond' }
    ];
    badgeMap.forEach(({ count, badge }) => {
      if (completedCount >= count && !newBadges.includes(badge)) newBadges.push(badge);
    });

    await userRef.update({
      coins: newCoins, coinsDaily: newCoinsDaily,
      coinsWeekly: newCoinsWeekly, coinsMonthly: newCoinsMonthly,
      xp: newXP, level, badges: newBadges
    });

    res.json({ message: `✅ Aprovado! +${sub.rewardCoins} moedas para ${sub.username}` });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── Rejeitar submission ──────────────────────────────────────────
exports.rejectSubmission = async (req, res) => {
  try {
    const db    = admin.database();
    const subId = req.params.id;
    const { note } = req.body;

    const subSnap = await db.ref(`rpg-quests/submissions/${subId}`).once('value');
    if (!subSnap.exists()) return res.status(404).json({ error: 'Não encontrada' });
    const sub = subSnap.val();

    const now = new Date().toISOString();

    await Promise.all([
      db.ref(`rpg-quests/submissions/${subId}`).update({
        status: 'rejected', reviewedBy: req.uid, reviewedAt: now,
        reviewNote: note || 'Comprovante inválido'
      }),
      db.ref(`rpg-quests/userQuests/${sub.userId}/${sub.questId}`).update({
        status: 'rejected', reviewedAt: now, reviewedBy: req.uid,
        reviewNote: note || 'Comprovante inválido'
      })
    ]);

    res.json({ message: '❌ Submissão rejeitada.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── Todos os usuários ────────────────────────────────────────────
exports.getAllUsers = async (req, res) => {
  try {
    const db   = admin.database();
    const snap = await db.ref('rpg-quests/users').once('value');
    const data = snap.val() || {};
    const users = Object.values(data).sort((a, b) => (b.coins || 0) - (a.coins || 0));
    res.json(users);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── Atualizar role ───────────────────────────────────────────────
exports.updateUserRole = async (req, res) => {
  try {
    const db  = admin.database();
    const { role } = req.body;
    if (!['user', 'admin'].includes(role)) return res.status(400).json({ error: 'Role inválida' });
    await db.ref(`rpg-quests/users/${req.params.uid}`).update({ role });
    res.json({ message: `Role atualizada para ${role}` });
  } catch (err) { res.status(500).json({ error: err.message }); }
};
