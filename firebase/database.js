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
  serverTimestamp, increment
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

    if (existing.status === "completed") {
      // Verifica se o cooldown do período passou
      const cooldownOver = _isCooldownOver(existing);
      if (!cooldownOver) {
        const nextReset = _getNextReset(existing.questType || quest.type);
        const label = { daily: "meia-noite", weekly: "domingo", monthly: "dia 1 do mês" }[quest.type] || "o próximo reset";
        throw new Error(`Você já completou esta quest! Ela reinicia em ${label}.`);
      }
      // Cooldown passou — cria nova entrada
    }

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

/* ─── Cooldown helpers (espelho de quests.js para server-side) ─ */
function _getNextReset(questType) {
  const d = new Date();
  if (questType === "daily") {
    const r = new Date(d); r.setDate(r.getDate() + 1); r.setHours(0,0,0,0); return r.getTime();
  } else if (questType === "weekly") {
    const r = new Date(d);
    const dow = r.getDay();
    const days = dow === 0 ? 7 : 7 - dow;
    r.setDate(r.getDate() + days); r.setHours(0,0,0,0); return r.getTime();
  } else if (questType === "monthly") {
    return new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0).getTime();
  }
  return null;
}

function _isCooldownOver(uq) {
  if (!uq || uq.status !== "completed") return false;
  const completedAt = uq.completedAt || uq.takenAt || 0;
  const questType   = uq.questType   || "event";
  if (questType === "event") return false;
  const completedDate = new Date(completedAt);
  let reset;
  if (questType === "daily") {
    reset = new Date(completedDate); reset.setDate(reset.getDate() + 1); reset.setHours(0,0,0,0);
  } else if (questType === "weekly") {
    reset = new Date(completedDate);
    const dow = reset.getDay(); const days = dow === 0 ? 7 : 7 - dow;
    reset.setDate(reset.getDate() + days); reset.setHours(0,0,0,0);
  } else if (questType === "monthly") {
    reset = new Date(completedDate.getFullYear(), completedDate.getMonth() + 1, 1, 0,0,0,0);
  }
  return reset ? Date.now() >= reset.getTime() : false;
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
  // Permitir reenvio se status for "active" ou "rejected"
  if (uq.status !== "active" && uq.status !== "rejected")
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
    status: "completed", reviewNote: null, completedAt: now()
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
                        questsRequired, xpBonus, coinsBonus,
                        category (quests|level|coins|event|special)
════════════════════════════════════════════════════════════════ */

/**
 * Conquistas padrão do sistema.
 * Serão criadas automaticamente se o banco não tiver nenhuma.
 */
export const DEFAULT_ACHIEVEMENTS = [
  /* ── PRIMEIROS PASSOS ──────────────────────────────────────── */
  { name: "Primeiros Passos",    icon: "🐾", category: "quests",
    description: "Complete sua primeira quest e entre para a história!",
    level: 1, questsRequired: 1,  xpBonus: 50,   coinsBonus: 10 },

  { name: "Aprendiz",            icon: "📚", category: "quests",
    description: "Complete 5 quests e mostre que você está comprometido.",
    level: 1, questsRequired: 5,  xpBonus: 100,  coinsBonus: 25 },

  { name: "Aventureiro",         icon: "⚔️", category: "quests",
    description: "Complete 10 quests — a aventura está apenas começando!",
    level: 2, questsRequired: 10, xpBonus: 200,  coinsBonus: 50 },

  /* ── PROGRESSÃO DE QUESTS ──────────────────────────────────── */
  { name: "Guerreiro",           icon: "🗡️", category: "quests",
    description: "Complete 25 quests e prove seu valor em batalha.",
    level: 3, questsRequired: 25, xpBonus: 350,  coinsBonus: 100 },

  { name: "Veterano",            icon: "🛡️", category: "quests",
    description: "50 quests concluídas — você é um verdadeiro veterano!",
    level: 5, questsRequired: 50, xpBonus: 500,  coinsBonus: 200 },

  { name: "Elite",               icon: "💎", category: "quests",
    description: "100 quests concluídas. Você está entre os melhores!",
    level: 7, questsRequired: 100, xpBonus: 800, coinsBonus: 350 },

  { name: "Lendário",            icon: "🌟", category: "quests",
    description: "250 quests concluídas. Sua lenda é conhecida em toda a terra!",
    level: 10, questsRequired: 250, xpBonus: 1500, coinsBonus: 600 },

  { name: "Imortal",             icon: "👑", category: "quests",
    description: "500 quests concluídas. Nenhum mortal chegou tão longe.",
    level: 15, questsRequired: 500, xpBonus: 3000, coinsBonus: 1000 },

  /* ── PROGRESSÃO DE NÍVEL ───────────────────────────────────── */
  { name: "Nível 5",             icon: "⭐", category: "level",
    description: "Alcance o Nível 5 e desbloqueie novos desafios.",
    level: 5, questsRequired: 0,  xpBonus: 150,  coinsBonus: 50 },

  { name: "Nível 10",            icon: "🌙", category: "level",
    description: "Alcance o Nível 10 — metade do caminho para a grandeza!",
    level: 10, questsRequired: 0, xpBonus: 300,  coinsBonus: 100 },

  { name: "Nível 20",            icon: "☀️", category: "level",
    description: "Nível 20 alcançado. Você transcendeu os limites comuns.",
    level: 20, questsRequired: 0, xpBonus: 600,  coinsBonus: 250 },

  { name: "Nível 50",            icon: "🔥", category: "level",
    description: "Nível 50! Um dos adventureiros mais poderosos do reino.",
    level: 50, questsRequired: 0, xpBonus: 2000, coinsBonus: 750 },

  /* ── QUESTS DIÁRIAS ────────────────────────────────────────── */
  { name: "Madrugador",          icon: "🌅", category: "daily",
    description: "Complete quests diárias por 7 dias seguidos.",
    level: 2, questsRequired: 7,  xpBonus: 200,  coinsBonus: 70 },

  { name: "Rotina de Ferro",     icon: "⚡", category: "daily",
    description: "30 quests diárias concluídas — a disciplina é sua força.",
    level: 4, questsRequired: 30, xpBonus: 400,  coinsBonus: 150 },

  /* ── QUESTS SEMANAIS ───────────────────────────────────────── */
  { name: "Semanal Perfeito",    icon: "📅", category: "weekly",
    description: "Complete 4 quests semanais consecutivas.",
    level: 3, questsRequired: 4,  xpBonus: 250,  coinsBonus: 100 },

  { name: "Mestre Semanal",      icon: "🏅", category: "weekly",
    description: "20 quests semanais concluídas — dominante nas semanas!",
    level: 6, questsRequired: 20, xpBonus: 500,  coinsBonus: 200 },

  /* ── QUESTS MENSAIS ────────────────────────────────────────── */
  { name: "Mensal de Elite",     icon: "🗓️", category: "monthly",
    description: "Complete 3 quests mensais — raridade extraordinária!",
    level: 5, questsRequired: 3,  xpBonus: 400,  coinsBonus: 200 },

  { name: "Titã Mensal",         icon: "🏆", category: "monthly",
    description: "12 quests mensais — um ano inteiro de dedicação!",
    level: 10, questsRequired: 12, xpBonus: 1000, coinsBonus: 500 },

  /* ── EVENTOS ───────────────────────────────────────────────── */
  { name: "Caçador de Eventos",  icon: "🎯", category: "event",
    description: "Participe do seu primeiro evento especial.",
    level: 1, questsRequired: 1,  xpBonus: 300,  coinsBonus: 100 },

  { name: "Evento Lendário",     icon: "🎪", category: "event",
    description: "Complete 5 quests de eventos — colecionador de raridades!",
    level: 3, questsRequired: 5,  xpBonus: 600,  coinsBonus: 250 },

  /* ── ESPECIAIS ─────────────────────────────────────────────── */
  { name: "Colecionador",        icon: "💰", category: "special",
    description: "Acumule 500 moedas — a fortuna sorri para os determinados.",
    level: 3, questsRequired: 15, xpBonus: 250,  coinsBonus: 0 },

  { name: "Milionário do Reino", icon: "💎", category: "special",
    description: "Acumule 2000 moedas — a riqueza do reino está em suas mãos!",
    level: 8, questsRequired: 50, xpBonus: 800,  coinsBonus: 0 },
];

/**
 * Popula o banco com as conquistas padrão se não existir nenhuma.
 * Seguro para chamar múltiplas vezes (verifica antes de criar).
 */
export async function proc_seedDefaultAchievements() {
  const existing = await proc_getAllAchievements();
  if (existing.length > 0) return { seeded: 0, existing: existing.length };

  let seeded = 0;
  for (const ach of DEFAULT_ACHIEVEMENTS) {
    const newRef = push(ref(db, "achievements"));
    await set(newRef, { ...ach, created_at: now() });
    seeded++;
  }
  return { seeded, existing: 0 };
}

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
    category:       String(data.category || "quests").trim(),
    level:          parseInt(data.level)          || 1,
    questsRequired: parseInt(data.questsRequired) || 0,
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
    category:       String(data.category || "quests").trim(),
    level:          parseInt(data.level)          || 1,
    questsRequired: parseInt(data.questsRequired) || 0,
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
  // Se os valores não forem fornecidos, ler do users/{uid}
  if (total === undefined) {
    const userSnap = await get(ref(db, `users/${uid}`));
    if (!userSnap.exists()) return;
    const u = userSnap.val();
    total   = u.coins        || 0;
    daily   = u.coinsDaily   || 0;
    weekly  = u.coinsWeekly  || 0;
    monthly = u.coinsMonthly || 0;
  }
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

  // Filtrar usuários com moedas > 0 para períodos diário/semanal/mensal
  const filtered = (period !== "total")
    ? entries.filter(e => (e[field] || 0) > 0)
    : entries;

  const sorted = filtered
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

  const timestamp = now();

  // 1) Ler dados atuais para salvar no histórico
  const [rankSnap, usersSnap] = await Promise.all([
    get(ref(db, "rankings")),
    get(ref(db, "users"))
  ]);

  const rankEntries = snapToArray(rankSnap);
  const usersMap    = {};
  snapToArray(usersSnap).forEach(u => { usersMap[u.uid || u.id] = u; });

  // Montar snapshot do ranking para histórico
  const historyEntries = rankEntries
    .filter(e => (e[field] || 0) > 0)
    .sort((a, b) => (b[field] || 0) - (a[field] || 0))
    .map((e, i) => {
      const u = usersMap[e.uid || e.id] || {};
      return {
        position:  i + 1,
        uid:       e.uid || e.id,
        nickname:  u.nickname || u.username || "Aventureiro",
        username:  u.username || "",
        level:     u.level || 1,
        coins:     e[field] || 0
      };
    });

  // 2) Salvar histórico em rankingHistory/{period}/{timestamp}
  const histRef = ref(db, `rankingHistory/${period}/${timestamp}`);
  await set(histRef, {
    period,
    resetAt:  timestamp,
    resetBy:  "admin",
    entries:  historyEntries
  });

  // 3) Zerar campo em rankings/{uid}
  const rankUpdates = {};
  rankEntries.forEach(e => {
    const id = e.uid || e.id;
    rankUpdates[`rankings/${id}/${field}`] = 0;
  });

  // 4) Zerar campo espelhado em users/{uid}
  snapToArray(usersSnap).forEach(u => {
    const id = u.uid || u.id;
    if (id) rankUpdates[`users/${id}/${field}`] = 0;
  });

  if (Object.keys(rankUpdates).length) await update(ref(db, "/"), rankUpdates);
  await set(ref(db, `meta/lastReset_${period}`), timestamp);

  return { period, resetAt: timestamp, count: historyEntries.length };
}

/**
 * Listar histórico de um período (ADMIN)
 */
export async function proc_getRankingHistory(period, limitN = 10) {
  const snap = await get(ref(db, `rankingHistory/${period}`));
  if (!snap.exists()) return [];

  const items = snapToArray(snap);
  items.sort((a, b) => (b.resetAt || 0) - (a.resetAt || 0));
  return limitN > 0 ? items.slice(0, limitN) : items;
}

export const getRankingHistory = proc_getRankingHistory;

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

    // Filtrar usuários com moedas > 0 para períodos diário/semanal/mensal
    const filtered = (period !== "total")
      ? rankData.filter(e => (e[field] || 0) > 0)
      : rankData;

    const result = filtered
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
   §9b  REAL-TIME LISTENERS – MAPS
════════════════════════════════════════════════════════════════ */

/**
 * Escuta TODOS os mapas em tempo real (admin).
 * callback(maps: array) — ordenado por created_at desc.
 */
export function listenAllMaps(callback) {
  const mapsRef = ref(db, "maps");
  const handler = (snap) => {
    let arr = snapToArray(snap);
    arr.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    callback(arr);
  };
  onValue(mapsRef, handler);
  return () => off(mapsRef, "value", handler);
}

/**
 * Escuta mapas PENDENTES em tempo real (admin).
 * callback(maps: array)
 */
export function listenPendingMaps(callback) {
  const mapsRef = ref(db, "maps");
  const handler = (snap) => {
    let arr = snapToArray(snap);
    arr = arr.filter(m => m.status === "pending");
    arr.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    callback(arr);
  };
  onValue(mapsRef, handler);
  return () => off(mapsRef, "value", handler);
}

/**
 * Escuta histórico de ranking de um período em tempo real (admin).
 * callback(history: array) — ordenado por resetAt desc.
 */
export function listenRankingHistory(period, callback) {
  const histRef = ref(db, `rankingHistory/${period}`);
  const handler = (snap) => {
    const arr = snapToArray(snap);
    arr.sort((a, b) => (b.resetAt || 0) - (a.resetAt || 0));
    callback(arr);
  };
  onValue(histRef, handler);
  return () => off(histRef, "value", handler);
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
export const seedDefaultAchievements = proc_seedDefaultAchievements;

export const updateRankingEntry = proc_updateRankingEntry;
export const getRanking         = proc_getRanking;
export const resetRanking       = proc_resetRanking;

export const getUserStats = proc_getUserStats;

/* ════════════════════════════════════════════════════════════════
   §11  MAPS SYSTEM
════════════════════════════════════════════════════════════════ */

/**
 * Submeter novo mapa para aprovação
 */
async function proc_submitMap(uid, mapData) {
  if (!uid || !mapData) throw new Error("UID e dados do mapa são obrigatórios");
  
  const user = await proc_getUser(uid);
  if (!user) throw new Error("Usuário não encontrado");

  // Validações
  if (!mapData.title || mapData.title.length < 3) {
    throw new Error("Título deve ter pelo menos 3 caracteres");
  }
  if (!mapData.description || mapData.description.length < 20) {
    throw new Error("Descrição deve ter pelo menos 20 caracteres");
  }
  if (!mapData.driveLink) {
    throw new Error("Link do Drive é obrigatório");
  }
  if (!mapData.screenshots || mapData.screenshots.length === 0) {
    throw new Error("Adicione pelo menos 1 print de preview");
  }

  const mapRef = push(ref(db, "maps"));
  const mapId = mapRef.key;

  const newMap = {
    id: mapId,
    title: mapData.title.trim(),
    description: mapData.description.trim(),
    topics: mapData.topics || [],
    authorUid: uid,
    authorName: user.nickname || user.username || "Aventureiro",
    
    driveLink: mapData.driveLink.trim(),
    screenshots: mapData.screenshots,
    downloadUrl: mapData.downloadUrl || mapData.driveLink,
    
    status: "pending",
    approvedBy: null,
    approvedAt: null,
    rejectionReason: null,
    
    coinsReward: 0,
    tokensReward: 0,
    rewardClaimed: false,
    
    likes: 0,
    favorites: 0,
    downloads: 0,
    views: 0,
    
    created_at: now(),
    updated_at: now(),
    lastEditedAt: null
  };

  await set(mapRef, newMap);
  
  // Atualizar contador do usuário
  await update(ref(db, `users/${uid}`), {
    mapsSubmitted: (user.mapsSubmitted || 0) + 1
  });

  return { id: mapId, ...newMap };
}

/**
 * Editar mapa existente (requer nova aprovação)
 */
async function proc_editMap(uid, mapId, updates) {
  const mapSnap = await get(ref(db, `maps/${mapId}`));
  if (!mapSnap.exists()) throw new Error("Mapa não encontrado");
  
  const map = mapSnap.val();
  if (map.authorUid !== uid) throw new Error("Você não pode editar este mapa");

  // Validações similares ao submitMap
  if (updates.title && updates.title.length < 3) {
    throw new Error("Título deve ter pelo menos 3 caracteres");
  }
  if (updates.description && updates.description.length < 20) {
    throw new Error("Descrição deve ter pelo menos 20 caracteres");
  }

  const updatedData = {
    ...updates,
    status: "pending", // Volta para aprovação
    approvedBy: null,
    approvedAt: null,
    rejectionReason: null,
    updated_at: now(),
    lastEditedAt: now()
  };

  await update(ref(db, `maps/${mapId}`), updatedData);
  return { id: mapId, ...map, ...updatedData };
}

/**
 * Aprovar mapa (ADMIN)
 */
async function proc_approveMap(mapId, adminUid, rewards = {}) {
  const mapSnap = await get(ref(db, `maps/${mapId}`));
  if (!mapSnap.exists()) throw new Error("Mapa não encontrado");
  
  const map = mapSnap.val();
  // Aceitar coins/tokens OU coinsReward/tokensReward
  const coinsReward  = rewards.coins  ?? rewards.coinsReward  ?? 50;
  const tokensReward = rewards.tokens ?? rewards.tokensReward ?? 10;

  // Atualizar mapa
  await update(ref(db, `maps/${mapId}`), {
    status: "approved",
    approvedBy: adminUid,
    approvedAt: now(),
    rejectionReason: null,
    coinsReward,
    tokensReward
  });

  // Dar recompensa ao autor (se ainda não recebeu)
  if (!map.rewardClaimed) {
    const author = await proc_getUser(map.authorUid);
    if (!author) throw new Error("Autor não encontrado");

    const newCoins        = (author.coins        || 0) + coinsReward;
    const newTokens       = (author.tokens       || 0) + tokensReward;
    const newCoinsDaily   = (author.coinsDaily   || 0) + coinsReward;
    const newCoinsWeekly  = (author.coinsWeekly  || 0) + coinsReward;
    const newCoinsMonthly = (author.coinsMonthly || 0) + coinsReward;
    const newMapsApproved = (author.mapsApproved || 0) + 1;

    await update(ref(db, `users/${map.authorUid}`), {
      coins:        newCoins,
      tokens:       newTokens,
      coinsDaily:   newCoinsDaily,
      coinsWeekly:  newCoinsWeekly,
      coinsMonthly: newCoinsMonthly,
      mapsApproved: newMapsApproved
    });

    await update(ref(db, `maps/${mapId}`), {
      rewardClaimed: true
    });

    // Atualizar ranking com todos os campos corretos
    await proc_updateRankingEntry(
      map.authorUid,
      newCoins,
      newCoinsDaily,
      newCoinsWeekly,
      newCoinsMonthly
    );
  }

  return { success: true, coinsReward, tokensReward };
}

/**
 * Rejeitar mapa (ADMIN)
 */
async function proc_rejectMap(mapId, adminUid, reason) {
  const mapSnap = await get(ref(db, `maps/${mapId}`));
  if (!mapSnap.exists()) throw new Error("Mapa não encontrado");

  await update(ref(db, `maps/${mapId}`), {
    status: "rejected",
    approvedBy: adminUid,
    approvedAt: now(),
    rejectionReason: reason || "Mapa não atende aos requisitos"
  });

  return { success: true };
}

/**
 * Listar mapas aprovados (Regiões)
 */
async function proc_getApprovedMaps() {
  const mapsSnap = await get(ref(db, "maps"));
  if (!mapsSnap.exists()) return [];

  let maps = snapToArray(mapsSnap);
  
  // Filtrar apenas aprovados
  maps = maps.filter(m => m.status === "approved");
  
  // Ordenar por likes (mais curtidos primeiro)
  maps.sort((a, b) => (b.likes || 0) - (a.likes || 0));

  return maps;
}

/**
 * Listar todos os mapas (ADMIN)
 */
async function proc_getAllMaps() {
  const mapsSnap = await get(ref(db, "maps"));
  if (!mapsSnap.exists()) return [];

  let maps = snapToArray(mapsSnap);
  maps.sort((a, b) => b.created_at - a.created_at);

  return maps;
}

/**
 * Listar mapas pendentes (ADMIN)
 */
async function proc_getPendingMaps() {
  const mapsSnap = await get(ref(db, "maps"));
  if (!mapsSnap.exists()) return [];

  let maps = snapToArray(mapsSnap);
  maps = maps.filter(m => m.status === "pending");
  maps.sort((a, b) => b.created_at - a.created_at);

  return maps;
}

/**
 * Listar meus mapas (usuário)
 */
async function proc_getMyMaps(uid) {
  const mapsSnap = await get(ref(db, "maps"));
  if (!mapsSnap.exists()) return [];

  let maps = snapToArray(mapsSnap);
  maps = maps.filter(m => m.authorUid === uid);
  maps.sort((a, b) => b.created_at - a.created_at);

  return maps;
}

/**
 * Curtir mapa
 */
async function proc_likeMap(mapId, uid) {
  const likeRef = ref(db, `mapLikes/${mapId}/${uid}`);
  const likeSnap = await get(likeRef);

  if (likeSnap.exists()) {
    // Já curtiu - remover like
    await remove(likeRef);
    await update(ref(db, `maps/${mapId}`), {
      likes: increment(-1)
    });
    return { liked: false };
  } else {
    // Adicionar like
    await set(likeRef, true);
    await update(ref(db, `maps/${mapId}`), {
      likes: increment(1)
    });
    return { liked: true };
  }
}

/**
 * Favoritar mapa
 */
async function proc_favoriteMap(mapId, uid) {
  const mapSnap = await get(ref(db, `maps/${mapId}`));
  if (!mapSnap.exists()) throw new Error("Mapa não encontrado");
  
  const map = mapSnap.val();
  const favRef = ref(db, `mapFavorites/${uid}/${mapId}`);
  const favSnap = await get(favRef);

  if (favSnap.exists()) {
    // Já favoritou - remover
    await remove(favRef);
    await update(ref(db, `maps/${mapId}`), {
      favorites: increment(-1)
    });
    return { favorited: false };
  } else {
    // Adicionar aos favoritos
    await set(favRef, {
      addedAt: now(),
      mapTitle: map.title
    });
    await update(ref(db, `maps/${mapId}`), {
      favorites: increment(1)
    });
    return { favorited: true };
  }
}

/**
 * Incrementar contador de downloads
 */
async function proc_incrementMapDownload(mapId) {
  await update(ref(db, `maps/${mapId}`), {
    downloads: increment(1)
  });
}

/**
 * Incrementar contador de visualizações
 */
async function proc_incrementMapView(mapId) {
  await update(ref(db, `maps/${mapId}`), {
    views: increment(1)
  });
}

/**
 * Verificar se usuário curtiu um mapa
 */
async function proc_checkUserLike(mapId, uid) {
  const likeSnap = await get(ref(db, `mapLikes/${mapId}/${uid}`));
  return likeSnap.exists();
}

/**
 * Verificar se usuário favoritou um mapa
 */
async function proc_checkUserFavorite(mapId, uid) {
  const favSnap = await get(ref(db, `mapFavorites/${uid}/${mapId}`));
  return favSnap.exists();
}

/**
 * Obter detalhes de um mapa
 */
async function proc_getMapDetails(mapId, viewerUid = null) {
  const mapSnap = await get(ref(db, `maps/${mapId}`));
  if (!mapSnap.exists()) throw new Error("Mapa não encontrado");
  
  const map = mapSnap.val();
  
  // Incrementar visualização
  await proc_incrementMapView(mapId);
  
  // Se houver um usuário visualizando, verificar likes/favoritos
  if (viewerUid) {
    const [liked, favorited] = await Promise.all([
      proc_checkUserLike(mapId, viewerUid),
      proc_checkUserFavorite(mapId, viewerUid)
    ]);
    
    return { ...map, userLiked: liked, userFavorited: favorited };
  }
  
  return map;
}

/**
 * Adicionar mapa exemplo (ADMIN)
 */
async function proc_addMapExample(exampleData) {
  const exampleRef = push(ref(db, "mapExamples"));
  const example = {
    id: exampleRef.key,
    title: exampleData.title,
    description: exampleData.description,
    downloadUrl: exampleData.downloadUrl,
    previewImage: exampleData.previewImage,
    created_at: now()
  };
  
  await set(exampleRef, example);
  return example;
}

/**
 * Listar mapas exemplo
 */
async function proc_getMapExamples() {
  const snap = await get(ref(db, "mapExamples"));
  if (!snap.exists()) return [];
  
  return snapToArray(snap);
}

// Adicionar aos exports
export const submitMap            = proc_submitMap;
export const editMap              = proc_editMap;
export const approveMap           = proc_approveMap;
export const rejectMap            = proc_rejectMap;
export const getApprovedMaps      = proc_getApprovedMaps;
export const getAllMaps           = proc_getAllMaps;
export const getPendingMaps       = proc_getPendingMaps;
export const getMyMaps            = proc_getMyMaps;
export const likeMap              = proc_likeMap;
export const favoriteMap          = proc_favoriteMap;
export const incrementMapDownload = proc_incrementMapDownload;
export const getMapDetails        = proc_getMapDetails;
export const addMapExample        = proc_addMapExample;
export const getMapExamples       = proc_getMapExamples;
