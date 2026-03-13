/* ================================================================
   firebase/database.js  –  v3.0  (Stored-Procedure Architecture)
   ----------------------------------------------------------------
   Cada "procedure" é responsável por UMA operação atômica.
   Nenhuma procedure chama outra diretamente quando isso pode
   causar double-fetch; use helpers privados (_xxx) em vez disso.

   Organização:
     §1  HELPERS
     §2  USERS       – proc_getUser, proc_upsertUser, proc_updateNickname
                       proc_updateUserIcon, proc_updateUserRole,
                       proc_getAllUsers, proc_awardUser
     §3  QUESTS      – proc_getQuest, proc_getAllQuests, proc_getActiveQuests
                       proc_createQuest, proc_updateQuest,
                       proc_toggleQuest, proc_deleteQuest
     §4  USER-QUESTS – proc_getUserQuests, proc_getLatestUserQuestByQuestId
                       proc_takeQuest
     §5  SUBMISSIONS – proc_submitQuestProof, proc_getPendingSubmissions
                       proc_approveSubmission, proc_rejectSubmission
     §6  RANKINGS    – proc_getRanking, proc_resetRanking
     §7  STATS       – proc_getUserStats
     §8  LEGACY EXPORTS (aliases para compatibilidade com admin.js / quests.js)
   ================================================================ */

import { db }       from "./services-config.js";
import { ADMIN_UID } from "./firebase-config.js";
import {
  ref, get, set, update, push, remove,
  query, orderByChild, equalTo,
  limitToLast, serverTimestamp
} from "./services-config.js";

/* ════════════════════════════════════════════════════════════════
   §1  HELPERS  (privados – não exportados)
════════════════════════════════════════════════════════════════ */

/** Converte snapshot Firebase em array com a key como `id` */
export function snapToArray(snap) {
  if (!snap || !snap.exists()) return [];
  const arr = [];
  snap.forEach(child => arr.push({ id: child.key, ...child.val() }));
  return arr;
}

/** Timestamp Unix em milissegundos */
export const now = () => Date.now();

/** Lê um caminho único e retorna val() ou null */
async function _read(path) {
  const snap = await get(ref(db, path));
  return snap.exists() ? snap.val() : null;
}

/** Lê um caminho e retorna { id, ...val } ou null */
async function _readWithId(path, id) {
  const snap = await get(ref(db, path));
  return snap.exists() ? { id, ...snap.val() } : null;
}

/* ════════════════════════════════════════════════════════════════
   §2  USERS
════════════════════════════════════════════════════════════════ */

/**
 * proc_getUser – busca perfil de usuário pelo UID.
 * Retorna objeto do usuário ou null se não existir.
 */
export async function proc_getUser(uid) {
  return _read(`users/${uid}`);
}

/**
 * proc_upsertUser – cria ou atualiza perfil de usuário.
 * Ao criar: preenche todos os campos com defaults.
 * Ao atualizar: só sobrescreve campos dinâmicos (email, photoURL).
 * Garante que o ADMIN_UID sempre tenha role="admin".
 * Retorna perfil atualizado.
 */
export async function proc_upsertUser(uid, data) {
  const existing = await proc_getUser(uid);
  if (!existing) {
    const username = data.username || data.displayName || "Aventureiro";
    await set(ref(db, `users/${uid}`), {
      uid,
      email:        data.email    || "",
      username,
      nickname:     username,
      photoURL:     data.photoURL || "",
      iconUrl:      "",
      coins:        0,
      xp:           0,
      level:        1,
      role:         uid === ADMIN_UID ? "admin" : "user",
      badges:       [],
      coinsDaily:   0,
      coinsWeekly:  0,
      coinsMonthly: 0,
      created_at:   now()
    });
  } else {
    const updates = {};
    if (data.photoURL && !existing.photoURL) updates.photoURL = data.photoURL;
    if (data.email   && !existing.email)     updates.email    = data.email;
    if (uid === ADMIN_UID && existing.role !== "admin") updates.role = "admin";
    if (Object.keys(updates).length) await update(ref(db, `users/${uid}`), updates);
  }
  return proc_getUser(uid);
}

/**
 * proc_updateNickname – altera nickname exibido do usuário.
 */
export async function proc_updateNickname(uid, nickname) {
  await update(ref(db, `users/${uid}`), { nickname });
}

/**
 * proc_updateUserIcon – define emoji de avatar; limpa photoURL para
 * garantir que o emoji tenha prioridade.
 */
export async function proc_updateUserIcon(uid, iconUrl) {
  await update(ref(db, `users/${uid}`), { iconUrl, photoURL: "" });
}

/**
 * proc_updateUserRole – muda role de um usuário (admin use only).
 */
export async function proc_updateUserRole(uid, role) {
  await update(ref(db, `users/${uid}`), { role });
}

/**
 * proc_getAllUsers – retorna lista completa de usuários.
 */
export async function proc_getAllUsers() {
  const snap = await get(ref(db, "users"));
  return snapToArray(snap);
}

/**
 * proc_awardUser – concede moedas e XP ao usuário, recalcula nível,
 * badges e atualiza contadores por período e ranking.
 */
export async function proc_awardUser(uid, coins, xp = 0) {
  const user = await proc_getUser(uid);
  if (!user) throw new Error(`Usuário ${uid} não encontrado`);

  const newCoins        = (user.coins        || 0) + coins;
  const newXP           = (user.xp           || 0) + xp;
  const newCoinsDaily   = (user.coinsDaily   || 0) + coins;
  const newCoinsWeekly  = (user.coinsWeekly  || 0) + coins;
  const newCoinsMonthly = (user.coinsMonthly || 0) + coins;

  // Recalcular nível (cada nível exige level×100 XP)
  let level = user.level || 1;
  let remaining = newXP;
  while (remaining >= level * 100) {
    remaining -= level * 100;
    level++;
  }

  // Badges por número de quests completadas
  const completed = await _countCompletedQuests(uid);
  const badges = [...(user.badges || [])];
  const addBadge = (n, key) => { if (completed >= n && !badges.includes(key)) badges.push(key); };
  addBadge(1,   "first_quest");
  addBadge(10,  "bronze");
  addBadge(50,  "silver");
  addBadge(100, "gold");
  addBadge(250, "diamond");

  await update(ref(db, `users/${uid}`), {
    coins: newCoins, xp: newXP, level, badges,
    coinsDaily: newCoinsDaily, coinsWeekly: newCoinsWeekly,
    coinsMonthly: newCoinsMonthly, updated_at: now()
  });

  // Atualizar entrada no ranking
  await proc_updateRankingEntry(uid, newCoins, newCoinsDaily, newCoinsWeekly, newCoinsMonthly);
}

async function _countCompletedQuests(uid) {
  const uqs = await proc_getUserQuests(uid);
  return uqs.filter(q => q.status === "completed").length;
}

/* ════════════════════════════════════════════════════════════════
   §3  QUESTS
════════════════════════════════════════════════════════════════ */

/**
 * proc_getQuest – busca uma quest pelo ID.
 * Retorna { id, ...dados } ou null.
 */
export async function proc_getQuest(questId) {
  const snap = await get(ref(db, `quests/${questId}`));
  return snap.exists() ? { id: snap.key, ...snap.val() } : null;
}

/**
 * proc_getAllQuests – retorna TODAS as quests (ativas e inativas).
 * Usado pelo painel admin.
 * Ordenadas por created_at decrescente (mais recentes primeiro).
 */
export async function proc_getAllQuests() {
  const snap = await get(ref(db, "quests"));
  const all  = snapToArray(snap);
  return all.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
}

/**
 * proc_getActiveQuests – retorna apenas quests ativas.
 * Filtro opcional por type ('daily', 'weekly', 'monthly', 'event').
 * Usado pela tela de "Pegar Quests".
 *
 * Regra: quest é ativa quando isActive é true, undefined, null ou qualquer
 * valor que não seja explicitamente false.
 * (Compatibilidade com dados legados que podem não ter o campo isActive.)
 */
export async function proc_getActiveQuests(type = null) {
  const all = await proc_getAllQuests();
  // Só exclui quests que tenham isActive === false explicitamente
  let active = all.filter(q => q.isActive !== false);
  if (type) active = active.filter(q => q.type === type);
  return active;
}

/**
 * proc_createQuest – cria nova quest (admin).
 * Retorna { id, ...dados } da quest criada.
 */
export async function proc_createQuest(data, adminUid) {
  const newRef = push(ref(db, "quests"));
  const quest = {
    title:         String(data.title || "").trim(),
    description:   String(data.description || "").trim(),
    type:          data.type || "daily",
    rewardCoins:   parseInt(data.rewardCoins) || 0,
    rewardXP:      parseInt(data.rewardXP)    || 0,
    maxUsers:      data.maxUsers ? parseInt(data.maxUsers) : null,
    currentUsers:  0,
    minLevel:      parseInt(data.minLevel) || 1,
    imageRequired: data.imageRequired !== false,
    expiresAt:     data.expiresAt ? new Date(data.expiresAt).getTime() : null,
    eventName:     data.eventName || null,
    isActive:      true,
    created_by:    adminUid || ADMIN_UID,
    created_at:    now()
  };
  await set(newRef, quest);
  return { id: newRef.key, ...quest };
}

/**
 * proc_updateQuest – edita campos de uma quest existente (admin).
 * NÃO altera: currentUsers, isActive, created_by, created_at.
 */
export async function proc_updateQuest(questId, data) {
  const updates = {
    title:         String(data.title || "").trim(),
    description:   String(data.description || "").trim(),
    type:          data.type || "daily",
    rewardCoins:   parseInt(data.rewardCoins) || 0,
    rewardXP:      parseInt(data.rewardXP)    || 0,
    maxUsers:      data.maxUsers ? parseInt(data.maxUsers) : null,
    minLevel:      parseInt(data.minLevel) || 1,
    imageRequired: data.imageRequired !== false,
    expiresAt:     data.expiresAt ? new Date(data.expiresAt).getTime() : null,
    eventName:     data.eventName || null,
    updated_at:    now()
  };
  await update(ref(db, `quests/${questId}`), updates);
}

/**
 * proc_toggleQuest – alterna isActive de uma quest (admin).
 * Retorna o novo valor de isActive.
 * Trata legado: se isActive era undefined/null/true → desativa (false);
 * se era false → ativa (true).
 */
export async function proc_toggleQuest(questId) {
  const quest = await proc_getQuest(questId);
  if (!quest) throw new Error("Quest não encontrada");
  // Considera "ativa" qualquer valor !== false (inclui undefined, null, true)
  const isCurrentlyActive = quest.isActive !== false;
  const newActive = !isCurrentlyActive;
  await update(ref(db, `quests/${questId}`), { isActive: newActive });
  return newActive;
}

/**
 * proc_deleteQuest – remove uma quest permanentemente (admin).
 */
export async function proc_deleteQuest(questId) {
  await remove(ref(db, `quests/${questId}`));
}

/* ════════════════════════════════════════════════════════════════
   §4  USER-QUESTS
════════════════════════════════════════════════════════════════ */

/**
 * proc_getUserQuests – retorna todas as userQuests de um usuário.
 */
export async function proc_getUserQuests(uid) {
  const snap = await get(ref(db, `userQuests/${uid}`));
  return snapToArray(snap);
}

/**
 * proc_getLatestUserQuestByQuestId – retorna a userQuest MAIS RECENTE
 * para um dado questId (usuário pode ter múltiplas tentativas após rejeição).
 * Retorna null se não existir nenhuma.
 */
export async function proc_getLatestUserQuestByQuestId(uid, questId) {
  const all = await proc_getUserQuests(uid);
  const matching = all.filter(uq => uq.questId === questId);
  if (!matching.length) return null;
  // Ordenar por takenAt decrescente → mais recente primeiro
  return matching.sort((a, b) => (b.takenAt || 0) - (a.takenAt || 0))[0];
}

/**
 * proc_takeQuest – usuário aceita uma quest.
 *
 * Validações:
 *  1. Quest existe
 *  2. Quest está ativa
 *  3. Usuário NÃO tem uma entrada ATIVA ou PENDENTE para esta quest
 *     (rejeições anteriores permitem nova tentativa)
 *  4. Quest não está lotada (maxUsers)
 *  5. Nível mínimo do usuário
 *
 * Retorna { id: userQuestId }.
 */
export async function proc_takeQuest(uid, questId) {
  // 1. Quest existe?
  const quest = await proc_getQuest(questId);
  if (!quest) throw new Error("Quest não encontrada");

  // 2. Quest ativa?
  if (quest.isActive === false) throw new Error("Esta quest não está mais disponível");

  // 3. Usuário já tem entrada ATIVA ou EM ANÁLISE?
  const existing = await proc_getLatestUserQuestByQuestId(uid, questId);
  if (existing) {
    if (existing.status === "active") {
      throw new Error("Você já está fazendo esta quest! Envie o comprovante em Minhas Quests.");
    }
    if (existing.status === "pending_review") {
      throw new Error("Seu comprovante já está em análise. Aguarde a revisão.");
    }
    if (existing.status === "completed") {
      throw new Error("Você já completou esta quest.");
    }
    // status === "rejected" → permite nova tentativa (não lança erro)
  }

  // 4. Vagas disponíveis?
  if (quest.maxUsers !== null && quest.maxUsers !== undefined) {
    const currentUsers = quest.currentUsers || 0;
    if (currentUsers >= quest.maxUsers) throw new Error("Esta quest está esgotada (sem vagas).");
  }

  // 5. Nível mínimo?
  if (quest.minLevel && quest.minLevel > 1) {
    const user = await proc_getUser(uid);
    if (user && (user.level || 1) < quest.minLevel) {
      throw new Error(`Você precisa ser Nível ${quest.minLevel} para esta quest (seu nível: ${user.level || 1}).`);
    }
  }

  // Criar userQuest
  const uqRef = push(ref(db, `userQuests/${uid}`));
  await set(uqRef, {
    questId,
    questTitle:  quest.title,
    questType:   quest.type,
    rewardCoins: quest.rewardCoins || 0,
    rewardXP:    quest.rewardXP   || 0,
    status:      "active",
    printUrl:    null,
    reviewNote:  null,
    takenAt:     now()
  });

  // Incrementar contador de participantes (write permitido por regras)
  const newCount = (quest.currentUsers || 0) + 1;
  await update(ref(db, `quests/${questId}`), { currentUsers: newCount });

  return { id: uqRef.key };
}

/* ════════════════════════════════════════════════════════════════
   §5  SUBMISSIONS
════════════════════════════════════════════════════════════════ */

/**
 * proc_submitQuestProof – usuário envia comprovante (print) de uma quest.
 *
 * Validações:
 *  1. userQuest existe e pertence ao uid
 *  2. Status da userQuest é "active"
 *
 * Muda status para "pending_review" e cria registro em /submissions.
 * Retorna { submissionId }.
 */
export async function proc_submitQuestProof(uid, userQuestId, printUrl) {
  const uqSnap = await get(ref(db, `userQuests/${uid}/${userQuestId}`));
  if (!uqSnap.exists()) throw new Error("Quest do usuário não encontrada.");

  const uq = uqSnap.val();
  if (uq.status !== "active") {
    const statusMsg = {
      pending_review: "Você já enviou um comprovante e está aguardando revisão.",
      completed:      "Esta quest já foi completada e aprovada.",
      rejected:       "Esta quest foi rejeitada. Pegue-a novamente para tentar de novo."
    };
    throw new Error(statusMsg[uq.status] || `Status inválido: ${uq.status}`);
  }

  // Atualizar userQuest → pending_review
  await update(ref(db, `userQuests/${uid}/${userQuestId}`), {
    status:      "pending_review",
    printUrl,
    submittedAt: now()
  });

  // Criar submissão para revisão admin
  const subRef = push(ref(db, "submissions"));
  await set(subRef, {
    uid,
    userQuestId,
    questId:     uq.questId,
    questTitle:  uq.questTitle,
    rewardCoins: uq.rewardCoins || 0,
    rewardXP:    uq.rewardXP   || 0,
    printUrl,
    status:      "pending",
    created_at:  now()
  });

  return { submissionId: subRef.key };
}

/**
 * proc_getPendingSubmissions – retorna todas as submissões com status "pending".
 */
export async function proc_getPendingSubmissions() {
  const snap = await get(ref(db, "submissions"));
  return snapToArray(snap).filter(s => s.status === "pending");
}

/**
 * proc_approveSubmission – admin aprova uma submissão.
 *
 * Ações:
 *  1. Marca submission como "approved"
 *  2. Marca userQuest como "completed"
 *  3. Concede moedas e XP ao usuário
 */
export async function proc_approveSubmission(submissionId, adminUid) {
  const subVal = await _read(`submissions/${submissionId}`);
  if (!subVal) throw new Error("Submissão não encontrada");

  await update(ref(db, `submissions/${submissionId}`), {
    status: "approved", reviewedBy: adminUid, reviewedAt: now()
  });

  await update(ref(db, `userQuests/${subVal.uid}/${subVal.userQuestId}`), {
    status: "completed", reviewNote: null
  });

  await proc_awardUser(subVal.uid, subVal.rewardCoins || 0, subVal.rewardXP || 0);
}

/**
 * proc_rejectSubmission – admin rejeita uma submissão.
 *
 * Ações:
 *  1. Marca submission como "rejected"
 *  2. Marca userQuest como "rejected" com nota
 *  3. Decrementa currentUsers da quest (libera vaga)
 */
export async function proc_rejectSubmission(submissionId, adminUid, note = "") {
  const subVal = await _read(`submissions/${submissionId}`);
  if (!subVal) throw new Error("Submissão não encontrada");

  await update(ref(db, `submissions/${submissionId}`), {
    status: "rejected", reviewedBy: adminUid, reviewedAt: now(), reviewNote: note
  });

  await update(ref(db, `userQuests/${subVal.uid}/${subVal.userQuestId}`), {
    status: "rejected", reviewNote: note
  });

  // Decrementar currentUsers (libera vaga para outros)
  const quest = await proc_getQuest(subVal.questId);
  if (quest && (quest.currentUsers || 0) > 0) {
    await update(ref(db, `quests/${subVal.questId}`), {
      currentUsers: quest.currentUsers - 1
    });
  }
}

/* ════════════════════════════════════════════════════════════════
   §6  RANKINGS
════════════════════════════════════════════════════════════════ */

/**
 * proc_updateRankingEntry – grava entrada do ranking para um usuário.
 * Chamado internamente por proc_awardUser.
 */
export async function proc_updateRankingEntry(uid, total, daily, weekly, monthly) {
  await set(ref(db, `rankings/${uid}`), {
    uid,
    coinsTotal:   total,
    coinsDaily:   daily,
    coinsWeekly:  weekly,
    coinsMonthly: monthly,
    updated_at:   now()
  });
}

/**
 * proc_getRanking – retorna ranking ordenado por período, enriquecido
 * com dados do perfil (nickname, photoURL, iconUrl, level, badges).
 * @param {string} period  "total" | "daily" | "weekly" | "monthly"
 * @param {number} limit   Máximo de entradas (padrão: 50)
 */
export async function proc_getRanking(period = "total", limit = 50) {
  const [rankSnap, usersSnap] = await Promise.all([
    get(ref(db, "rankings")),
    get(ref(db, "users"))
  ]);
  const entries  = snapToArray(rankSnap);
  const usersArr = snapToArray(usersSnap);

  // Mapa uid → perfil de usuário
  const userMap = {};
  usersArr.forEach(u => { userMap[u.uid || u.id] = u; });

  const field = { total: "coinsTotal", daily: "coinsDaily",
                  weekly: "coinsWeekly", monthly: "coinsMonthly" }[period] || "coinsTotal";

  return entries
    .sort((a, b) => (b[field] || 0) - (a[field] || 0))
    .slice(0, limit)
    .map((e, i) => {
      const u = userMap[e.uid] || {};
      return {
        ...e,
        position:  i + 1,
        coins:     e[field] || 0,
        nickname:  u.nickname  || u.username || "Aventureiro",
        username:  u.username  || "Aventureiro",
        photoURL:  u.photoURL  || "",
        iconUrl:   u.iconUrl   || "",
        level:     u.level     || 1,
        badges:    u.badges    || []
      };
    });
}

/**
 * proc_resetRanking – zera os contadores de moedas do período especificado.
 * @param {string} period  "daily" | "weekly" | "monthly"
 */
export async function proc_resetRanking(period) {
  const fieldMap = { daily: "coinsDaily", weekly: "coinsWeekly", monthly: "coinsMonthly" };
  const field    = fieldMap[period];
  if (!field) throw new Error(`Período inválido: ${period}`);

  const snap    = await get(ref(db, "rankings"));
  const entries = snapToArray(snap);
  const updates = {};
  entries.forEach(e => { updates[`rankings/${e.id}/${field}`] = 0; });
  if (Object.keys(updates).length) await update(ref(db, "/"), updates);

  await set(ref(db, `meta/lastReset_${period}`), now());
}

/* ════════════════════════════════════════════════════════════════
   §7  STATS  (dashboard do usuário)
════════════════════════════════════════════════════════════════ */

/**
 * proc_getUserStats – retorna dados completos para o dashboard do usuário.
 * Inclui: todos os campos do perfil + progresso de XP + contagem de quests.
 */
export async function proc_getUserStats(uid) {
  const [user, uqs] = await Promise.all([
    proc_getUser(uid),
    proc_getUserQuests(uid)
  ]);
  if (!user) return null;

  const level      = user.level || 1;
  const xp         = user.xp   || 0;
  const xpNeeded   = level * 100;
  const xpProgress = xp % xpNeeded || xp;
  const xpPercent  = Math.min(Math.round((xpProgress / xpNeeded) * 100), 100);

  // Para cada questId, pegar apenas a entrada MAIS RECENTE
  // (usuário pode ter reiniciado uma quest rejeitada)
  const latestByQuestId = {};
  uqs.forEach(uq => {
    const prev = latestByQuestId[uq.questId];
    if (!prev || (uq.takenAt || 0) > (prev.takenAt || 0)) {
      latestByQuestId[uq.questId] = uq;
    }
  });
  const latest = Object.values(latestByQuestId);

  return {
    ...user,
    xpProgress,
    xpForNextLevel: xpNeeded,
    xpPercent,
    quests: {
      total:     latest.length,
      active:    latest.filter(q => q.status === "active").length,
      pending:   latest.filter(q => q.status === "pending_review").length,
      completed: latest.filter(q => q.status === "completed").length,
      rejected:  latest.filter(q => q.status === "rejected").length
    }
  };
}

/* ════════════════════════════════════════════════════════════════
   §8  LEGACY EXPORTS
   Aliases que mantêm compatibilidade com os arquivos JS existentes
   (admin.js, home.js, quests.js, session-manager.js, ranking.js)
   sem precisar alterar as chamadas nesses arquivos.
════════════════════════════════════════════════════════════════ */

// Users
export const getUser           = proc_getUser;
export const upsertUser        = proc_upsertUser;
export const updateNickname    = proc_updateNickname;
export const updateUserIcon    = proc_updateUserIcon;
export const updateUserRole    = proc_updateUserRole;
export const getAllUsers        = proc_getAllUsers;
export const awardUser         = proc_awardUser;

// Quests
export const getQuest          = proc_getQuest;
/** @deprecated use proc_getActiveQuests */
export const getQuests         = proc_getActiveQuests;
export const createQuest       = proc_createQuest;
export const updateQuest       = proc_updateQuest;
export const toggleQuest       = proc_toggleQuest;
export const deleteQuest       = proc_deleteQuest;

// UserQuests
export const getUserQuests     = proc_getUserQuests;
export const takeQuest         = proc_takeQuest;

// Submissions
export const submitQuestProof      = proc_submitQuestProof;
export const getPendingSubmissions = proc_getPendingSubmissions;
export const approveSubmission     = proc_approveSubmission;
export const rejectSubmission      = proc_rejectSubmission;

// Rankings
export const updateRankingEntry = proc_updateRankingEntry;
export const getRanking         = proc_getRanking;
export const resetRanking       = proc_resetRanking;

// Stats
export const getUserStats = proc_getUserStats;
