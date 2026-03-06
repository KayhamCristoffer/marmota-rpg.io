/* ================================================================
   firebase/database.js
   Todas as operações de leitura/escrita no Firebase Realtime DB
   Organizado por entidade: Users, Quests, UserQuests, Submissions,
   Rankings, Meta
   ================================================================ */

import { db }                    from "./services-config.js";
import { ADMIN_UID }             from "./firebase-config.js";
import {
  ref, get, set, update, push, remove,
  query, orderByChild, equalTo,
  limitToLast, serverTimestamp
} from "./services-config.js";

/* ════════════════════════════════════════════════════════════════
   HELPERS
════════════════════════════════════════════════════════════════ */

/** Converte snapshot do Firebase em array com key como id */
export function snapToArray(snapshot) {
  if (!snapshot.exists()) return [];
  const arr = [];
  snapshot.forEach(child => arr.push({ id: child.key, ...child.val() }));
  return arr;
}

/** Gera timestamp Unix em ms */
export const now = () => Date.now();

/* ════════════════════════════════════════════════════════════════
   USERS
════════════════════════════════════════════════════════════════ */

/** Busca perfil de um usuário pelo UID */
export async function getUser(uid) {
  const snap = await get(ref(db, `users/${uid}`));
  return snap.exists() ? snap.val() : null;
}

/** Cria ou atualiza perfil de usuário (merge) */
export async function upsertUser(uid, data) {
  const existing = await getUser(uid);
  if (!existing) {
    // Novo usuário
    await set(ref(db, `users/${uid}`), {
      uid,
      email:       data.email      || "",
      username:    data.username   || data.displayName || "Aventureiro",
      nickname:    data.nickname   || data.displayName || "Aventureiro",
      photoURL:    data.photoURL   || "",
      iconUrl:     data.iconUrl    || "",
      coins:       0,
      xp:          0,
      level:       1,
      role:        uid === ADMIN_UID ? "admin" : "user",
      badges:      [],
      coinsDaily:  0,
      coinsWeekly: 0,
      coinsMonthly:0,
      created_at:  now()
    });
  } else {
    // Atualizar campos dinâmicos
    const updates = {};
    if (data.photoURL && !existing.photoURL)  updates.photoURL = data.photoURL;
    if (data.email   && !existing.email)      updates.email    = data.email;
    // Garantir role admin para UID fixo
    if (uid === ADMIN_UID && existing.role !== "admin") updates.role = "admin";
    if (Object.keys(updates).length) {
      await update(ref(db, `users/${uid}`), updates);
    }
  }
  return getUser(uid);
}

/** Atualiza nickname do usuário */
export async function updateNickname(uid, nickname) {
  await update(ref(db, `users/${uid}`), { nickname });
}

/** Atualiza ícone/emoji de avatar do usuário */
export async function updateUserIcon(uid, iconUrl) {
  // Limpar photoURL para dar prioridade ao iconUrl
  await update(ref(db, `users/${uid}`), { iconUrl, photoURL: "" });
}

/** Atualiza role do usuário (admin only) */
export async function updateUserRole(uid, role) {
  await update(ref(db, `users/${uid}`), { role });
}

/** Lista todos os usuários (admin only) */
export async function getAllUsers() {
  const snap = await get(ref(db, "users"));
  return snapToArray(snap);
}

/** Adiciona moedas/XP ao usuário e recalcula level/badges */
export async function awardUser(uid, coins, xp = 0) {
  const user = await getUser(uid);
  if (!user) return;

  const newCoins        = (user.coins        || 0) + coins;
  const newXP           = (user.xp           || 0) + xp;
  const newCoinsDaily   = (user.coinsDaily   || 0) + coins;
  const newCoinsWeekly  = (user.coinsWeekly  || 0) + coins;
  const newCoinsMonthly = (user.coinsMonthly || 0) + coins;

  // Calcular level (cada level precisa de level * 100 XP)
  let level = user.level || 1;
  let remaining = newXP;
  while (remaining >= level * 100) {
    remaining -= level * 100;
    level++;
  }

  // Calcular badges
  const completed = await countCompletedQuests(uid);
  const badges = [...(user.badges || [])];
  if (completed >= 1   && !badges.includes("first_quest")) badges.push("first_quest");
  if (completed >= 10  && !badges.includes("bronze"))      badges.push("bronze");
  if (completed >= 50  && !badges.includes("silver"))      badges.push("silver");
  if (completed >= 100 && !badges.includes("gold"))        badges.push("gold");
  if (completed >= 250 && !badges.includes("diamond"))     badges.push("diamond");

  await update(ref(db, `users/${uid}`), {
    coins:        newCoins,
    xp:           newXP,
    level,
    badges,
    coinsDaily:   newCoinsDaily,
    coinsWeekly:  newCoinsWeekly,
    coinsMonthly: newCoinsMonthly,
    updated_at:   now()
  });

  // Atualizar ranking
  await updateRankingEntry(uid, newCoins, newCoinsDaily, newCoinsWeekly, newCoinsMonthly);
}

/* ════════════════════════════════════════════════════════════════
   QUESTS
════════════════════════════════════════════════════════════════ */

/** Busca todas as quests ativas */
export async function getQuests(type = null) {
  const snap = await get(ref(db, "quests"));
  let quests = snapToArray(snap).filter(q => q.isActive !== false);
  if (type) quests = quests.filter(q => q.type === type);
  // Ordenar por data de criação (mais recentes primeiro)
  return quests.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
}

/** Busca uma quest pelo ID */
export async function getQuest(questId) {
  const snap = await get(ref(db, `quests/${questId}`));
  return snap.exists() ? { id: snap.key, ...snap.val() } : null;
}

/** Cria nova quest (admin) */
export async function createQuest(data, adminUid) {
  const newRef = push(ref(db, "quests"));
  const quest = {
    title:         data.title,
    description:   data.description,
    type:          data.type || "daily",
    rewardCoins:   parseInt(data.rewardCoins) || 0,
    rewardXP:      parseInt(data.rewardXP)    || 0,
    maxUsers:      data.maxUsers ? parseInt(data.maxUsers) : null,
    currentUsers:  0,
    minLevel:      parseInt(data.minLevel)    || 1,
    imageRequired: data.imageRequired !== false,
    expiresAt:     data.expiresAt ? new Date(data.expiresAt).getTime() : null,
    eventName:     data.eventName || null,
    isActive:      true,
    created_by:    adminUid,
    created_at:    now()
  };
  await set(newRef, quest);
  return { id: newRef.key, ...quest };
}

/** Edita uma quest (admin) */
export async function updateQuest(questId, data) {
  const updates = {
    title:         data.title,
    description:   data.description,
    type:          data.type,
    rewardCoins:   parseInt(data.rewardCoins) || 0,
    rewardXP:      parseInt(data.rewardXP)    || 0,
    maxUsers:      data.maxUsers ? parseInt(data.maxUsers) : null,
    minLevel:      parseInt(data.minLevel)    || 1,
    imageRequired: data.imageRequired !== false,
    expiresAt:     data.expiresAt ? new Date(data.expiresAt).getTime() : null,
    eventName:     data.eventName || null,
    updated_at:    now()
  };
  await update(ref(db, `quests/${questId}`), updates);
}

/** Ativa/desativa uma quest (toggle) */
export async function toggleQuest(questId) {
  const quest = await getQuest(questId);
  if (!quest) throw new Error("Quest não encontrada");
  await update(ref(db, `quests/${questId}`), { isActive: !quest.isActive });
  return !quest.isActive;
}

/** Deleta uma quest (admin) */
export async function deleteQuest(questId) {
  await remove(ref(db, `quests/${questId}`));
}

/* ════════════════════════════════════════════════════════════════
   USER QUESTS (quests aceitas pelo usuário)
════════════════════════════════════════════════════════════════ */

/** Busca todas as quests de um usuário */
export async function getUserQuests(uid) {
  const snap = await get(ref(db, `userQuests/${uid}`));
  return snapToArray(snap);
}

/** Verifica se o usuário já pegou uma quest */
export async function getUserQuestByQuestId(uid, questId) {
  const all = await getUserQuests(uid);
  return all.find(uq => uq.questId === questId) || null;
}

/** Usuário aceita uma quest */
export async function takeQuest(uid, questId) {
  const quest = await getQuest(questId);
  if (!quest) throw new Error("Quest não encontrada");
  if (!quest.isActive) throw new Error("Quest inativa");

  // Verificar se já pegou
  const existing = await getUserQuestByQuestId(uid, questId);
  if (existing && ["active", "pending_review", "completed"].includes(existing.status)) {
    throw new Error("Você já possui esta quest");
  }

  // Verificar limite
  if (quest.maxUsers && quest.currentUsers >= quest.maxUsers) {
    throw new Error("Quest esgotada");
  }

  // Verificar nível mínimo
  const user = await getUser(uid);
  if (user && quest.minLevel > 1 && (user.level || 1) < quest.minLevel) {
    throw new Error(`Nível mínimo ${quest.minLevel} necessário`);
  }

  // Criar userQuest
  const uqRef = push(ref(db, `userQuests/${uid}`));
  await set(uqRef, {
    questId,
    questTitle:  quest.title,
    questType:   quest.type,
    rewardCoins: quest.rewardCoins,
    rewardXP:    quest.rewardXP || 0,
    status:      "active",
    printUrl:    null,
    reviewNote:  null,
    takenAt:     now()
  });

  // Incrementar currentUsers na quest
  await update(ref(db, `quests/${questId}`), {
    currentUsers: (quest.currentUsers || 0) + 1
  });

  return { id: uqRef.key };
}

/** Usuário envia comprovante (print) */
export async function submitQuestProof(uid, userQuestId, printUrl) {
  const uqSnap = await get(ref(db, `userQuests/${uid}/${userQuestId}`));
  if (!uqSnap.exists()) throw new Error("UserQuest não encontrada");

  const uq = uqSnap.val();
  if (uq.status !== "active") throw new Error("Esta quest não está ativa");

  // Atualizar status
  await update(ref(db, `userQuests/${uid}/${userQuestId}`), {
    status:      "pending_review",
    printUrl,
    submittedAt: now()
  });

  // Criar submissão para o admin revisar
  const subRef = push(ref(db, "submissions"));
  await set(subRef, {
    uid,
    userQuestId,
    questId:     uq.questId,
    questTitle:  uq.questTitle,
    rewardCoins: uq.rewardCoins,
    rewardXP:    uq.rewardXP || 0,
    printUrl,
    status:      "pending",
    created_at:  now()
  });

  return { submissionId: subRef.key };
}

/* ════════════════════════════════════════════════════════════════
   SUBMISSIONS (admin review)
════════════════════════════════════════════════════════════════ */

/** Lista todas as submissões pendentes */
export async function getPendingSubmissions() {
  const snap = await get(ref(db, "submissions"));
  const all  = snapToArray(snap);
  return all.filter(s => s.status === "pending");
}

/** Admin aprova uma submissão */
export async function approveSubmission(submissionId, adminUid) {
  const subSnap = await get(ref(db, `submissions/${submissionId}`));
  if (!subSnap.exists()) throw new Error("Submissão não encontrada");
  const sub = subSnap.val();

  // Atualizar submissão
  await update(ref(db, `submissions/${submissionId}`), {
    status:      "approved",
    reviewedBy:  adminUid,
    reviewedAt:  now()
  });

  // Atualizar userQuest
  await update(ref(db, `userQuests/${sub.uid}/${sub.userQuestId}`), {
    status:     "completed",
    reviewNote: null
  });

  // Premiar usuário
  await awardUser(sub.uid, sub.rewardCoins, sub.rewardXP || 0);
}

/** Admin rejeita uma submissão */
export async function rejectSubmission(submissionId, adminUid, note = "") {
  const subSnap = await get(ref(db, `submissions/${submissionId}`));
  if (!subSnap.exists()) throw new Error("Submissão não encontrada");
  const sub = subSnap.val();

  await update(ref(db, `submissions/${submissionId}`), {
    status:      "rejected",
    reviewedBy:  adminUid,
    reviewedAt:  now(),
    reviewNote:  note
  });

  await update(ref(db, `userQuests/${sub.uid}/${sub.userQuestId}`), {
    status:     "rejected",
    reviewNote: note
  });

  // Decrementar currentUsers
  const quest = await getQuest(sub.questId);
  if (quest && quest.currentUsers > 0) {
    await update(ref(db, `quests/${sub.questId}`), {
      currentUsers: quest.currentUsers - 1
    });
  }
}

/* ════════════════════════════════════════════════════════════════
   RANKINGS
════════════════════════════════════════════════════════════════ */

/** Atualiza entrada do ranking para um usuário */
export async function updateRankingEntry(uid, total, daily, weekly, monthly) {
  await set(ref(db, `rankings/${uid}`), {
    uid,
    coinsTotal:   total,
    coinsDaily:   daily,
    coinsWeekly:  weekly,
    coinsMonthly: monthly,
    updated_at:   now()
  });
}

/** Busca ranking por período, ordenado */
export async function getRanking(period = "total", limit = 50) {
  const snap    = await get(ref(db, "rankings"));
  const entries = snapToArray(snap);

  const field = {
    total:   "coinsTotal",
    daily:   "coinsDaily",
    weekly:  "coinsWeekly",
    monthly: "coinsMonthly"
  }[period] || "coinsTotal";

  return entries
    .sort((a, b) => (b[field] || 0) - (a[field] || 0))
    .slice(0, limit)
    .map((e, i) => ({ ...e, position: i + 1, coins: e[field] || 0 }));
}

/** Reset de ranking por período (admin / CRON) */
export async function resetRanking(period) {
  const field = {
    daily:   "coinsDaily",
    weekly:  "coinsWeekly",
    monthly: "coinsMonthly"
  }[period];
  if (!field) throw new Error("Período inválido");

  const snap    = await get(ref(db, "rankings"));
  const entries = snapToArray(snap);
  const updates = {};
  entries.forEach(e => { updates[`rankings/${e.id}/${field}`] = 0; });
  if (Object.keys(updates).length) {
    const { getDatabase, ref: dbRef, update: dbUpdate } = await import(
      "https://www.gstatic.com/firebasejs/12.10.0/firebase-database.js"
    );
    // multi-path update
    await update(ref(db, "/"), updates);
  }

  // Registrar em meta
  await set(ref(db, `meta/lastReset_${period}`), now());
}

/* ════════════════════════════════════════════════════════════════
   STATS (para dashboard do usuário)
════════════════════════════════════════════════════════════════ */

/** Contagem de quests completadas por usuário */
export async function countCompletedQuests(uid) {
  const uqs = await getUserQuests(uid);
  return uqs.filter(uq => uq.status === "completed").length;
}

/** Stats completas do usuário para o dashboard */
export async function getUserStats(uid) {
  const [user, uqs] = await Promise.all([
    getUser(uid),
    getUserQuests(uid)
  ]);
  if (!user) return null;

  const level      = user.level || 1;
  const xp         = user.xp   || 0;
  const xpNeeded   = level * 100;
  const xpProgress = xp % xpNeeded || xp;
  const xpPercent  = Math.min(Math.round((xpProgress / xpNeeded) * 100), 100);

  return {
    ...user,
    xpProgress,
    xpForNextLevel: xpNeeded,
    xpPercent,
    quests: {
      total:    uqs.length,
      active:   uqs.filter(q => q.status === "active").length,
      pending:  uqs.filter(q => q.status === "pending_review").length,
      completed:uqs.filter(q => q.status === "completed").length,
      rejected: uqs.filter(q => q.status === "rejected").length
    }
  };
}
