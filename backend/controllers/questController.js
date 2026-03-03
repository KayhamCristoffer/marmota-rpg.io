const admin = require('firebase-admin');

// ─── Listar todas as quests ──────────────────────────────────────
exports.getAllQuests = async (req, res) => {
  try {
    const db   = admin.database();
    const uid  = req.uid;

    const [questsSnap, myQuestsSnap] = await Promise.all([
      db.ref('rpg-quests/quests').once('value'),
      db.ref(`rpg-quests/userQuests/${uid}`).once('value')
    ]);

    const quests    = questsSnap.val()    || {};
    const myQuests  = myQuestsSnap.val()  || {};

    const { type } = req.query;

    const result = Object.values(quests)
      .filter(q => q.isActive !== false)
      .filter(q => !type || type === 'all' || q.type === type)
      .filter(q => !q.expiresAt || new Date(q.expiresAt) > new Date())
      .map(q => ({
        ...q,
        isAvailable: !q.maxUsers || (q.currentUsers || 0) < q.maxUsers,
        userStatus:  myQuests[q.id]?.status || null
      }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── Minhas quests ───────────────────────────────────────────────
exports.getMyQuests = async (req, res) => {
  try {
    const db  = admin.database();
    const uid = req.uid;
    const { status } = req.query;

    const snap = await db.ref(`rpg-quests/userQuests/${uid}`).once('value');
    const data = snap.val() || {};

    let result = Object.values(data);
    if (status && status !== 'all') {
      result = result.filter(q => q.status === status);
    }

    result.sort((a, b) => new Date(b.takenAt) - new Date(a.takenAt));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── Pegar quest ─────────────────────────────────────────────────
exports.takeQuest = async (req, res) => {
  try {
    const db      = admin.database();
    const uid     = req.uid;
    const questId = req.params.id;

    const [questSnap, userSnap, alreadySnap] = await Promise.all([
      db.ref(`rpg-quests/quests/${questId}`).once('value'),
      db.ref(`rpg-quests/users/${uid}`).once('value'),
      db.ref(`rpg-quests/userQuests/${uid}/${questId}`).once('value')
    ]);

    if (!questSnap.exists()) return res.status(404).json({ error: 'Quest não encontrada' });
    const quest = questSnap.val();
    const user  = userSnap.val() || {};

    if (!quest.isActive)  return res.status(400).json({ error: 'Quest inativa' });
    if (quest.expiresAt && new Date(quest.expiresAt) < new Date())
      return res.status(400).json({ error: 'Quest expirada' });
    if (quest.maxUsers && (quest.currentUsers || 0) >= quest.maxUsers)
      return res.status(400).json({ error: 'Quest esgotada' });
    if (alreadySnap.exists())
      return res.status(400).json({ error: 'Você já pegou esta quest' });
    if ((user.level || 1) < (quest.minLevel || 1))
      return res.status(400).json({ error: `Nível ${quest.minLevel} necessário` });

    const userQuest = {
      userQuestId: `${uid}_${questId}`,
      userId:      uid,
      questId:     questId,
      questTitle:  quest.title,
      questType:   quest.type,
      rewardCoins: quest.rewardCoins,
      rewardXP:    quest.rewardXP || 0,
      status:      'active',
      printUrl:    null,
      printPath:   null,
      reviewedBy:  null,
      reviewNote:  null,
      takenAt:     new Date().toISOString(),
      completedAt: null,
      reviewedAt:  null
    };

    await Promise.all([
      db.ref(`rpg-quests/userQuests/${uid}/${questId}`).set(userQuest),
      db.ref(`rpg-quests/quests/${questId}/currentUsers`).transaction(v => (v || 0) + 1)
    ]);

    res.status(201).json({ message: 'Quest aceita! Boa sorte! ⚔️', userQuest });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── Enviar print ────────────────────────────────────────────────
exports.submitQuest = async (req, res) => {
  try {
    const db      = admin.database();
    const uid     = req.uid;
    const questId = req.params.id;
    const { printUrl, printPath } = req.body;

    if (!printUrl) return res.status(400).json({ error: 'URL da imagem é obrigatória' });

    const userQuestRef  = db.ref(`rpg-quests/userQuests/${uid}/${questId}`);
    const userQuestSnap = await userQuestRef.once('value');

    if (!userQuestSnap.exists())
      return res.status(404).json({ error: 'Quest não encontrada' });
    if (userQuestSnap.val().status !== 'active')
      return res.status(400).json({ error: 'Quest não está ativa' });

    // Buscar dados do usuário para a submission
    const [userSnap, questSnap] = await Promise.all([
      db.ref(`rpg-quests/users/${uid}`).once('value'),
      db.ref(`rpg-quests/quests/${questId}`).once('value')
    ]);
    const user  = userSnap.val()  || {};
    const quest = questSnap.val() || {};

    // Atualizar userQuest
    await userQuestRef.update({
      status:      'pending_review',
      printUrl,
      printPath:   printPath || null
    });

    // Criar submission global para o admin ver
    const subId  = `${uid}_${questId}`;
    const subData = {
      id:          subId,
      userId:      uid,
      questId:     questId,
      questTitle:  quest.title || userQuestSnap.val().questTitle,
      username:    user.nickname || user.username || 'Unknown',
      photoURL:    user.photoURL || '',
      rewardCoins: quest.rewardCoins || userQuestSnap.val().rewardCoins || 0,
      rewardXP:    quest.rewardXP   || userQuestSnap.val().rewardXP    || 0,
      printUrl,
      printPath:   printPath || null,
      status:      'pending_review',
      submittedAt: new Date().toISOString(),
      reviewedBy:  null,
      reviewNote:  null,
      reviewedAt:  null
    };

    await db.ref(`rpg-quests/submissions/${subId}`).set(subData);

    res.json({ message: 'Enviado para revisão! Aguarde aprovação do admin. ⏳' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
