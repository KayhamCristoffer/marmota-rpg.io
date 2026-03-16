/* ================================================================
   firebase/database.js  –  v5.0
   ----------------------------------------------------------------
   Regras de negócio:
   • Uma quest pode ser feita UMA VEZ por usuário.
   • Quests rejeitadas permitem reenvio (mesma entrada reativada).
   • "Minhas Quests" mostra TODAS as entradas do usuário.
   • Admin vê TODAS as quests (ativas e inativas).
   • Conquistas são gerenciadas pelo admin e concedidas automaticamente.
   • Todas as listas usam onValue para tempo real OU get() com
     snapToArray robusto que garante retorno de TODOS os itens.

   Organização:
     §1  HELPERS  (snapToArray, snapToObj, now, _read, _readAll)
     §2  USERS
     §3  QUESTS
     §4  USER-QUESTS
     §5  SUBMISSIONS
     §6  ACHIEVEMENTS
     §7  RANKINGS
     §8  STATS
     §9  REAL-TIME LISTENERS  (onValue wrappers)
     §10 LEGACY EXPORTS
   ================================================================ */

import { db }        from "./services-config.js";
import { ADMIN_UID } from "./firebase-config.js";
import {
  ref, get, set, update, push, remove,
  query, orderByChild, equalTo,
  limitToLast, onValue, off,
  serverTimestamp
} from "./services-config.js";

/* ════════════════════════════════════════════════════════════════
   §1  HELPERS
════════════════════════════════════════════════════════════════ */

/**
 * Converte DataSnapshot do Firebase em array JS.
 * ROBUSTO: funciona com 0, 1 ou N filhos.
 * Garante iteração correta mesmo com 1 único filho.
 */
export function snapToArray(snap) {
  if (!snap || !snap.exists()) return [];
  const arr = [];
  try {
    snap.forEach(child => {
      const val = child.val();
      if (val !== null && val !== undefined) {
        arr.push({
          id: child.key,
          ...(typeof val === "object" && !Array.isArray(val) ? val : { value: val })
        });
      }
    });
  } catch (e) {
    console.error("[snapToArray] forEach error:", e);
    // fallback: tentar val() como objeto
    const raw = snap.val();
    if (raw && typeof raw === "object") {
      Object.entries(raw).forEach(([key, val]) => {
        if (val !== null && val !== undefined) {
          arr.push({
            id: key,
            ...(typeof val === "object" && !Array.isArray(val) ? val : { value: val })
          });
        }
      });
    }
  }
  return arr;
}

/**
 * Converte DataSnapshot em objeto {key: val} para lookup rápido.
 */
export function snapToObj(snap) {
  if (!snap || !snap.exists()) return {};
  const obj = {};
  snap.forEach(child => {
    obj[child.key] = child.val();
  });
  return obj;
}

/** Timestamp Unix em milissegundos */
export const now = () => Date.now();

/** Lê um caminho único e retorna val() ou null */
async function _read(path) {
  const snap = await get(ref(db, path));
  return snap.exists() ? snap.val() : null;
}

/** Lê um caminho e retorna array COMPLETO */
async function _readAll(path) {
  const snap = await get(ref(db, path));
  return snapToArray(snap);
}

/* ════════════════════════════════════════════════════════════════
   §2  USERS
════════════════════════════════════════════════════════════════ */

export async function proc_getUser(uid) {
  const snap = await get(ref(db, `users/${uid}`));
  return snap.exists() ? { id: snap.key, ...snap.val() } : null;
}

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

export async function proc_updateNickname(uid, nickname) {
  await update(ref(db, `users/${uid}`), { nickname: String(nickname).slice(0, 20) });
}

export async function proc_updateUserIcon(uid, iconUrl) {
  await update(ref(db, `users/${uid}`), { iconUrl });
}

export async function proc_updateUserRole(uid, role) {
  await update(ref(db, `users/${uid}`), { role });
}

/**
 * Retorna TODOS os usuários do banco.
 * Usa snapToArray robusto + fallback Object.entries.
 */
export async function proc_getAllUsers() {
  const snap = await get(ref(db, "users"));
  if (!snap.exists()) return [];

  // Método primário: forEach
  const arr = snapToArray(snap);
  if (arr.length > 0) return arr;

  // Fallback: Object.entries direto
  const raw = snap.val();
  if (raw && typeof raw === "object") {
    return Object.entries(raw).map(([id, val]) => ({
      id,
      uid: id,
      ...(typeof val === "object" ? val : { value: val })
    }));
  }
  return [];
}

export async function proc_awardUser(uid, coins, xp = 0) {
  const user = await proc_getUser(uid);
  if (!user) throw new Error(`Usuário ${uid} não encontrado`);

  const newCoins        = (user.coins        || 0) + coins;
  const newXP           = (user.xp           || 0) + xp;
  const newCoinsDaily   = (user.coinsDaily   || 0) + coins;
  const newCoinsWeekly  = (user.coinsWeekly  || 0) + coins;
  const newCoinsMonthly = (user.coinsMonthly || 0) + coins;

  let level = user.level || 1;
  let remaining = newXP;
  while (remaining >= level * 100) { remaining -= level * 100; level++; }

  await update(ref(db, `users/${uid}`), {
    coins: newCoins, xp: newXP, level,
    coinsDaily: newCoinsDaily, coinsWeekly: newCoinsWeekly,
    coinsMonthly: newCoinsMonthly, updated_at: now()
  });

  const completed = await _countCompletedQuests(uid);
  await proc_checkAndAwardAchievements(uid, completed, level);
  await proc_updateRankingEntry(uid, newCoins, newCoinsDaily, newCoinsWeekly, newCoinsMonthly);
}

async function _countCompletedQuests(uid) {
  const uqs = await proc_getUserQuests(uid);
  return uqs.filter(q => q.status === "completed").length;
}

/* ════════════════════════════════════════════════════════════════
   §3  QUESTS
════════════════════════════════════════════════════════════════ */

export async function proc_getQuest(questId) {
  const snap = await get(ref(db, `quests/${questId}`));
  return snap.exists() ? { id: snap.key, ...snap.val() } : null;
}

/**
 * Retorna TODAS as quests – admin.
 * Garante que TODOS os itens são retornados.
 */
export async function proc_getAllQuests() {
  const snap = await get(ref(db, "quests"));
  if (!snap.exists()) return [];

  let all = snapToArray(snap);

  // Fallback se snapToArray retornar vazio
  if (all.length === 0) {
    const raw = snap.val();
    if (raw && typeof raw === "object") {
      all = Object.entries(raw).map(([id, val]) => ({
        id,
        ...(typeof val === "object" ? val : { value: val })
      }));
    }
  }

  return all.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
}

/** Retorna quests ativas (isActive !== false) – usuários */
export async function proc_getActiveQuests(type = null) {
  const all    = await proc_getAllQuests();
  let   active = all.filter(q => q.isActive !== false);
  if (type) active = active.filter(q => q.type === type);
  return active;
}

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

export async function proc_updateQuest(questId, data) {
  await update(ref(db, `quests/${questId}`), {
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
  });
}

export async function proc_toggleQuest(questId) {
  const quest = await proc_getQuest(questId);
  if (!quest) throw new Error("Quest não encontrada");
  const isCurrentlyActive = quest.isActive !== false;
  const newActive = !isCurrentlyActive;
  await update(ref(db, `quests/${questId}`), { isActive: newActive });
  return newActive;
}

export async function proc_deleteQuest(questId) {
  await remove(ref(db, `quests/${questId}`));
}

/* ════════════════════════════════════════════════════════════════
   §4  USER-QUESTS
   • 1x por usuário por quest
   • Rejeitada → reativa mesma entrada (reenvio sem duplicata)
   • getUserQuests retorna TODAS as entradas
════════════════════════════════════════════════════════════════ */

/**
 * Retorna TODAS as userQuests de um usuário.
 * Garante que TODOS os itens são retornados com fallback.
 */
export async function proc_getUserQuests(uid) {
  const snap = await get(ref(db, `userQuests/${uid}`));
  if (!snap.exists()) return [];

  let arr = snapToArray(snap);

  // Fallback se snapToArray retornar vazio mas snap.exists()
  if (arr.length === 0) {
    const raw = snap.val();
    if (raw && typeof raw === "object") {
      arr = Object.entries(raw).map(([id, val]) => ({
        id,
        ...(typeof val === "object" ? val : { value: val })
      }));
    }
  }

  return arr;
}

/** Retorna a entrada do usuário para uma quest específica (ou null) */
export async function proc_getUserQuestByQuestId(uid, questId) {
  const all = await proc_getUserQuests(uid);
  return all.find(uq => uq.questId === questId) || null;
}

export async function proc_takeQuest(uid, questId) {
  const quest = await proc_getQuest(questId);
  if (!quest) throw new Error("Quest não encontrada");
  if (quest.isActive === false) throw new Error("Esta quest não está mais disponível");

  const existing = await proc_getUserQuestByQuestId(uid, questId);

  if (existing) {
    if (existing.status === "active")
      throw new Error("Você já está fazendo esta quest! Envie o comprovante em Minhas Quests.");
    if (existing.status === "pending_review")
      throw new Error("Seu comprovante está em análise. Aguarde a revisão.");
    if (existing.status === "completed")
      throw new Error("Você já completou esta quest. Cada quest pode ser feita apenas 1 vez.");
    if (existing.status === "rejected") {
      await update(ref(db, `userQuests/${uid}/${existing.id}`), {
        status: "active", printUrl: null, reviewNote: null, takenAt: now()
      });
      const newCount = (quest.currentUsers || 0) + 1;
      await update(ref(db, `quests/${questId}`), { currentUsers: newCount });
      return { id: existing.id };
    }
  }

  if (quest.maxUsers !== null && quest.maxUsers !== undefined) {
    if ((quest.currentUsers || 0) >= quest.maxUsers)
      throw new Error("Esta quest está esgotada (sem vagas).");
  }

  if (quest.minLevel && quest.minLevel > 1) {
    const user = await proc_getUser(uid);
    if (user && (user.level || 1) < quest.minLevel)
      throw new Error(`Você precisa ser Nível ${quest.minLevel} (seu nível: ${user.level || 1}).`);
  }

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

  const newCount = (quest.currentUsers || 0) + 1;
  await update(ref(db, `quests/${questId}`), { currentUsers: newCount });
  return { id: uqRef.key };
}

/* ════════════════════════════════════════════════════════════════
   §5  SUBMISSIONS
════════════════════════════════════════════════════════════════ */

export async function proc_submitQuestProof(uid, userQuestId, printUrl) {
  const uqSnap = await get(ref(db, `userQuests/${uid}/${userQuestId}`));
  if (!uqSnap.exists()) throw new Error("Quest do usuário não encontrada.");

  const uq = uqSnap.val();
  if (uq.status === "pending_review")
    throw new Error("Você já enviou um comprovante e está aguardando revisão.");
  if (uq.status === "completed")
    throw new Error("Esta quest já foi completada.");
  if (uq.status !== "active")
    throw new Error(`Não é possível enviar comprovante: status "${uq.status}".`);

  await update(ref(db, `userQuests/${uid}/${userQuestId}`), {
    status: "pending_review", printUrl, submittedAt: now()
  });

  const subRef = push(ref(db, "submissions"));
  await set(subRef, {
    uid, userQuestId,
    questId:    uq.questId,
    questTitle: uq.questTitle,
    rewardCoins: uq.rewardCoins || 0,
    rewardXP:    uq.rewardXP   || 0,
    printUrl,
    status:     "pending",
    created_at: now()
  });

  return { submissionId: subRef.key };
}

/**
 * Retorna submissões PENDENTES.
 * Busca TODAS e filtra — garante que nenhuma é perdida.
 */
export async function proc_getPendingSubmissions() {
  const snap = await get(ref(db, "submissions"));
  if (!snap.exists()) return [];

  let all = snapToArray(snap);
  if (all.length === 0) {
    const raw = snap.val();
    if (raw && typeof raw === "object") {
      all = Object.entries(raw).map(([id, val]) => ({
        id, ...(typeof val === "object" ? val : { value: val })
      }));
    }
  }

  return all.filter(s => s.status === "pending");
}

export async function proc_getAllSubmissions() {
  const snap = await get(ref(db, "submissions"));
  if (!snap.exists()) return [];

  let all = snapToArray(snap);
  if (all.length === 0) {
    const raw = snap.val();
    if (raw && typeof raw === "object") {
      all = Object.entries(raw).map(([id, val]) => ({
        id, ...(typeof val === "object" ? val : { value: val })
      }));
    }
  }
  return all;
}

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

export async function proc_rejectSubmission(submissionId, adminUid, note = "") {
  const subVal = await _read(`submissions/${submissionId}`);
  if (!subVal) throw new Error("Submissão não encontrada");

  await update(ref(db, `submissions/${submissionId}`), {
    status: "rejected", reviewedBy: adminUid, reviewedAt: now(), reviewNote: note
  });
  await update(ref(db, `userQuests/${subVal.uid}/${subVal.userQuestId}`), {
    status: "rejected", reviewNote: note
  });

  const quest = await proc_getQuest(subVal.questId);
  if (quest && (quest.currentUsers || 0) > 0) {
    await update(ref(db, `quests/${subVal.questId}`), {
      currentUsers: quest.currentUsers - 1
    });
  }
}

/* ════════════════════════════════════════════════════════════════
   §6  ACHIEVEMENTS
   /achievements/{id}: name, icon, description, level,
                        questsRequired, xpBonus, coinsBonus
════════════════════════════════════════════════════════════════ */

/**
 * Retorna TODAS as conquistas.
 * Garante retorno completo com fallback.
 */
export async function proc_getAllAchievements() {
  const snap = await get(ref(db, "achievements"));
  if (!snap.exists()) return [];

  let arr = snapToArray(snap);
  if (arr.length === 0) {
    const raw = snap.val();
    if (raw && typeof raw === "object") {
      arr = Object.entries(raw).map(([id, val]) => ({
        id, ...(typeof val === "object" ? val : { value: val })
      }));
    }
  }

  return arr.sort((a, b) => (a.questsRequired || 0) - (b.questsRequired || 0));
}

export async function proc_createAchievement(data) {
  const newRef = push(ref(db, "achievements"));
  const ach = {
    name:           String(data.name || "").trim(),
    icon:           String(data.icon || "🏆").trim(),
    description:    String(data.description || "").trim(),
    level:          parseInt(data.level)          || 1,
    questsRequired: parseInt(data.questsRequired) || 1,
    xpBonus:        parseInt(data.xpBonus)        || 0,
    coinsBonus:     parseInt(data.coinsBonus)     || 0,
    created_at:     now()
  };
  await set(newRef, ach);
  return { id: newRef.key, ...ach };
}

export async function proc_updateAchievement(achId, data) {
  await update(ref(db, `achievements/${achId}`), {
    name:           String(data.name || "").trim(),
    icon:           String(data.icon || "🏆").trim(),
    description:    String(data.description || "").trim(),
    level:          parseInt(data.level)          || 1,
    questsRequired: parseInt(data.questsRequired) || 1,
    xpBonus:        parseInt(data.xpBonus)        || 0,
    coinsBonus:     parseInt(data.coinsBonus)     || 0,
    updated_at:     now()
  });
}

export async function proc_deleteAchievement(achId) {
  await remove(ref(db, `achievements/${achId}`));
}

export async function proc_checkAndAwardAchievements(uid, completedCount, userLevel) {
  const [user, achievements] = await Promise.all([
    proc_getUser(uid),
    proc_getAllAchievements()
  ]);
  if (!user || !achievements.length) return;

  const existingBadges = Array.isArray(user.badges) ? [...user.badges] : [];
  let totalBonusCoins = 0, totalBonusXP = 0;
  const newBadges = [];

  for (const ach of achievements) {
    if (existingBadges.includes(ach.id)) continue;
    if (completedCount >= (ach.questsRequired || 0) && userLevel >= (ach.level || 1)) {
      existingBadges.push(ach.id);
      newBadges.push(ach);
      totalBonusCoins += ach.coinsBonus || 0;
      totalBonusXP    += ach.xpBonus    || 0;
    }
  }

  if (!newBadges.length) return;

  await update(ref(db, `users/${uid}`), { badges: existingBadges });

  if (totalBonusCoins > 0 || totalBonusXP > 0) {
    const fresh = await proc_getUser(uid);
    if (fresh) {
      const newCoins = (fresh.coins || 0) + totalBonusCoins;
      const newXP    = (fresh.xp    || 0) + totalBonusXP;
      let level = fresh.level || 1, rem = newXP;
      while (rem >= level * 100) { rem -= level * 100; level++; }
      await update(ref(db, `users/${uid}`), {
        coins: newCoins, xp: newXP, level,
        coinsDaily:   (fresh.coinsDaily   || 0) + totalBonusCoins,
        coinsWeekly:  (fresh.coinsWeekly  || 0) + totalBonusCoins,
        coinsMonthly: (fresh.coinsMonthly || 0) + totalBonusCoins,
      });
    }
  }
}

/* ════════════════════════════════════════════════════════════════
   §7  RANKINGS
════════════════════════════════════════════════════════════════ */

export async function proc_updateRankingEntry(uid, total, daily, weekly, monthly) {
  await set(ref(db, `rankings/${uid}`), {
    uid, coinsTotal: total, coinsDaily: daily,
    coinsWeekly: weekly, coinsMonthly: monthly, updated_at: now()
  });
}

/**
 * Retorna ranking completo.
 * limit=0 → retorna TODOS sem corte.
 */
export async function proc_getRanking(period = "total", limit = 100) {
  const [rankSnap, usersSnap] = await Promise.all([
    get(ref(db, "rankings")),
    get(ref(db, "users"))
  ]);

  let entries  = snapToArray(rankSnap);
  let usersArr = snapToArray(usersSnap);

  // Fallbacks
  if (entries.length === 0 && rankSnap.exists()) {
    const raw = rankSnap.val();
    if (raw && typeof raw === "object") {
      entries = Object.entries(raw).map(([id, val]) => ({
        id, ...(typeof val === "object" ? val : {})
      }));
    }
  }
  if (usersArr.length === 0 && usersSnap.exists()) {
    const raw = usersSnap.val();
    if (raw && typeof raw === "object") {
      usersArr = Object.entries(raw).map(([id, val]) => ({
        id, uid: id, ...(typeof val === "object" ? val : {})
      }));
    }
  }

  const userMap = {};
  usersArr.forEach(u => { userMap[u.uid || u.id] = u; });

  const field = {
    total:   "coinsTotal",
    daily:   "coinsDaily",
    weekly:  "coinsWeekly",
    monthly: "coinsMonthly"
  }[period] || "coinsTotal";

  const sorted = entries
    .sort((a, b) => (b[field] || 0) - (a[field] || 0));

  const sliced = (limit > 0) ? sorted.slice(0, limit) : sorted;

  return sliced.map((e, i) => {
    const u = userMap[e.uid || e.id] || {};
    return {
      ...e,
      position: i + 1,
      coins:    e[field] || 0,
      nickname: u.nickname  || u.username || "Aventureiro",
      username: u.username  || "Aventureiro",
      photoURL: u.photoURL  || "",
      iconUrl:  u.iconUrl   || "",
      level:    u.level     || 1,
      badges:   u.badges    || []
    };
  });
}

export async function proc_resetRanking(period) {
  const fieldMap = { daily:"coinsDaily", weekly:"coinsWeekly", monthly:"coinsMonthly" };
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
   §8  STATS
════════════════════════════════════════════════════════════════ */

export async function proc_getUserStats(uid) {
  const [user, uqs, achievements] = await Promise.all([
    proc_getUser(uid),
    proc_getUserQuests(uid),
    proc_getAllAchievements()
  ]);
  if (!user) return null;

  const level      = user.level || 1;
  const xp         = user.xp   || 0;
  const xpNeeded   = level * 100;
  const xpProgress = xp % xpNeeded || xp;
  const xpPercent  = Math.min(Math.round((xpProgress / xpNeeded) * 100), 100);

  const active    = uqs.filter(q => q.status === "active").length;
  const pending   = uqs.filter(q => q.status === "pending_review").length;
  const completed = uqs.filter(q => q.status === "completed").length;
  const rejected  = uqs.filter(q => q.status === "rejected").length;

  const badgeIds  = Array.isArray(user.badges) ? user.badges : [];
  const badgeMap  = {};
  achievements.forEach(a => { badgeMap[a.id] = a; });
  const earnedAchievements = badgeIds.map(id => badgeMap[id]).filter(Boolean);

  return {
    ...user,
    xpProgress, xpForNextLevel: xpNeeded, xpPercent,
    quests: { total: uqs.length, active, pending, completed, rejected },
    earnedAchievements
  };
}

/* ════════════════════════════════════════════════════════════════
   §9  REAL-TIME LISTENERS
   Funções que usam onValue para atualização em tempo real.
   Retornam função "unsubscribe" para cancelar o listener.
════════════════════════════════════════════════════════════════ */

/**
 * Escuta quests em tempo real.
 * callback(quests: array) é chamado sempre que os dados mudam.
 * Retorna função unsubscribe.
 */
export function listenQuests(callback) {
  const questsRef = ref(db, "quests");
  const handler = (snap) => {
    let arr = snapToArray(snap);
    if (arr.length === 0 && snap.exists()) {
      const raw = snap.val();
      if (raw && typeof raw === "object") {
        arr = Object.entries(raw).map(([id, val]) => ({
          id, ...(typeof val === "object" ? val : { value: val })
        }));
      }
    }
    const sorted = arr.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    callback(sorted);
  };
  onValue(questsRef, handler);
  return () => off(questsRef, "value", handler);
}

/**
 * Escuta userQuests de um usuário em tempo real.
 * Retorna função unsubscribe.
 */
export function listenUserQuests(uid, callback) {
  const uqRef = ref(db, `userQuests/${uid}`);
  const handler = (snap) => {
    let arr = snapToArray(snap);
    if (arr.length === 0 && snap.exists()) {
      const raw = snap.val();
      if (raw && typeof raw === "object") {
        arr = Object.entries(raw).map(([id, val]) => ({
          id, ...(typeof val === "object" ? val : { value: val })
        }));
      }
    }
    callback(arr);
  };
  onValue(uqRef, handler);
  return () => off(uqRef, "value", handler);
}

/**
 * Escuta submissões em tempo real.
 * Retorna função unsubscribe.
 */
export function listenSubmissions(callback) {
  const subRef = ref(db, "submissions");
  const handler = (snap) => {
    let arr = snapToArray(snap);
    if (arr.length === 0 && snap.exists()) {
      const raw = snap.val();
      if (raw && typeof raw === "object") {
        arr = Object.entries(raw).map(([id, val]) => ({
          id, ...(typeof val === "object" ? val : { value: val })
        }));
      }
    }
    callback(arr);
  };
  onValue(subRef, handler);
  return () => off(subRef, "value", handler);
}

/**
 * Escuta usuários em tempo real.
 * Retorna função unsubscribe.
 */
export function listenUsers(callback) {
  const usersRef = ref(db, "users");
  const handler = (snap) => {
    let arr = snapToArray(snap);
    if (arr.length === 0 && snap.exists()) {
      const raw = snap.val();
      if (raw && typeof raw === "object") {
        arr = Object.entries(raw).map(([id, val]) => ({
          id, uid: id, ...(typeof val === "object" ? val : { value: val })
        }));
      }
    }
    callback(arr);
  };
  onValue(usersRef, handler);
  return () => off(usersRef, "value", handler);
}

/**
 * Escuta conquistas em tempo real.
 * Retorna função unsubscribe.
 */
export function listenAchievements(callback) {
  const achRef = ref(db, "achievements");
  const handler = (snap) => {
    let arr = snapToArray(snap);
    if (arr.length === 0 && snap.exists()) {
      const raw = snap.val();
      if (raw && typeof raw === "object") {
        arr = Object.entries(raw).map(([id, val]) => ({
          id, ...(typeof val === "object" ? val : { value: val })
        }));
      }
    }
    const sorted = arr.sort((a, b) => (a.questsRequired || 0) - (b.questsRequired || 0));
    callback(sorted);
  };
  onValue(achRef, handler);
  return () => off(achRef, "value", handler);
}

/**
 * Escuta rankings em tempo real.
 * Retorna função unsubscribe.
 */
export function listenRanking(period = "total", callback) {
  const rankRef  = ref(db, "rankings");
  const usersRef = ref(db, "users");

  let rankData  = null;
  let usersData = null;

  const field = {
    total:   "coinsTotal",
    daily:   "coinsDaily",
    weekly:  "coinsWeekly",
    monthly: "coinsMonthly"
  }[period] || "coinsTotal";

  function _emit() {
    if (!rankData || !usersData) return;
    const userMap = {};
    usersData.forEach(u => { userMap[u.uid || u.id] = u; });

    const result = rankData
      .sort((a, b) => (b[field] || 0) - (a[field] || 0))
      .map((e, i) => {
        const u = userMap[e.uid || e.id] || {};
        return {
          ...e,
          position: i + 1,
          coins:    e[field] || 0,
          nickname: u.nickname  || u.username || "Aventureiro",
          username: u.username  || "Aventureiro",
          photoURL: u.photoURL  || "",
          iconUrl:  u.iconUrl   || "",
          level:    u.level     || 1,
          badges:   u.badges    || []
        };
      });
    callback(result);
  }

  const rankHandler = (snap) => {
    rankData = snapToArray(snap);
    if (rankData.length === 0 && snap.exists()) {
      const raw = snap.val();
      if (raw && typeof raw === "object") {
        rankData = Object.entries(raw).map(([id, val]) => ({
          id, ...(typeof val === "object" ? val : {})
        }));
      }
    }
    _emit();
  };

  const usersHandler = (snap) => {
    usersData = snapToArray(snap);
    if (usersData.length === 0 && snap.exists()) {
      const raw = snap.val();
      if (raw && typeof raw === "object") {
        usersData = Object.entries(raw).map(([id, val]) => ({
          id, uid: id, ...(typeof val === "object" ? val : {})
        }));
      }
    }
    _emit();
  };

  onValue(rankRef,  rankHandler);
  onValue(usersRef, usersHandler);

  return () => {
    off(rankRef,  "value", rankHandler);
    off(usersRef, "value", usersHandler);
  };
}

/* ════════════════════════════════════════════════════════════════
   §10  LEGACY EXPORTS
════════════════════════════════════════════════════════════════ */
export const getUser           = proc_getUser;
export const upsertUser        = proc_upsertUser;
export const updateNickname    = proc_updateNickname;
export const updateUserIcon    = proc_updateUserIcon;
export const updateUserRole    = proc_updateUserRole;
export const getAllUsers        = proc_getAllUsers;
export const awardUser         = proc_awardUser;

export const getQuest          = proc_getQuest;
export const getQuests         = proc_getActiveQuests;
export const createQuest       = proc_createQuest;
export const updateQuest       = proc_updateQuest;
export const toggleQuest       = proc_toggleQuest;
export const deleteQuest       = proc_deleteQuest;

export const getUserQuests        = proc_getUserQuests;
export const getUserQuestByQuestId = proc_getUserQuestByQuestId;
export const takeQuest            = proc_takeQuest;

export const submitQuestProof      = proc_submitQuestProof;
export const getPendingSubmissions = proc_getPendingSubmissions;
export const getAllSubmissions      = proc_getAllSubmissions;
export const approveSubmission     = proc_approveSubmission;
export const rejectSubmission      = proc_rejectSubmission;

export const getAllAchievements       = proc_getAllAchievements;
export const createAchievement       = proc_createAchievement;
export const updateAchievement       = proc_updateAchievement;
export const deleteAchievement       = proc_deleteAchievement;
export const checkAndAwardAchievements = proc_checkAndAwardAchievements;

export const updateRankingEntry = proc_updateRankingEntry;
export const getRanking         = proc_getRanking;
export const resetRanking       = proc_resetRanking;

export const getUserStats = proc_getUserStats;
