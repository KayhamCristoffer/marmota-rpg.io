/* ================================================================
   firebase/firebase.datatime.js  –  v5.0
   ----------------------------------------------------------------
   DOCUMENTAÇÃO COMPLETA DO MODELO DE DADOS
   Firebase Realtime Database  –  marmota-rpg

   Gerado automaticamente em: 2026-03-16
   ================================================================

   ESTRUTURA GERAL
   ───────────────
   /users/{uid}
   /quests/{questId}
   /userQuests/{uid}/{userQuestId}
   /submissions/{submissionId}
   /achievements/{achievementId}
   /rankings/{uid}
   /meta/{key}

   ================================================================ */

export const FIREBASE_DATATIME_VERSION = "5.0";
export const GENERATED_AT = "2026-03-16";

/* ════════════════════════════════════════════════════════════════
   /users/{uid}
════════════════════════════════════════════════════════════════ */
export const USER_SCHEMA = {
  uid:           "string   – Firebase Auth UID",
  email:         "string   – e-mail do usuário",
  username:      "string   – nome vindo do provider OAuth",
  nickname:      "string   – apelido escolhido (máx. 20 chars)",
  photoURL:      "string   – URL da foto de perfil (OAuth)",
  iconUrl:       "string   – emoji escolhido como avatar",
  coins:         "number   – moedas totais acumuladas",
  xp:            "number   – XP total",
  level:         "number   – nível atual (calculado pelo XP)",
  role:          "string   – 'user' | 'admin'",
  badges:        "string[] – array de IDs de conquistas ganhas",
  coinsDaily:    "number   – moedas do período diário",
  coinsWeekly:   "number   – moedas do período semanal",
  coinsMonthly:  "number   – moedas do período mensal",
  created_at:    "number   – timestamp Unix (ms)",
  updated_at:    "number   – timestamp Unix (ms)",
};

/* ════════════════════════════════════════════════════════════════
   /quests/{questId}
════════════════════════════════════════════════════════════════ */
export const QUEST_SCHEMA = {
  title:         "string   – título da quest",
  description:   "string   – descrição completa",
  type:          "string   – 'daily' | 'weekly' | 'monthly' | 'event'",
  rewardCoins:   "number   – moedas concedidas ao completar",
  rewardXP:      "number   – XP concedido ao completar",
  maxUsers:      "number?  – vagas disponíveis (null = ilimitado)",
  currentUsers:  "number   – contador de quem pegou a quest",
  minLevel:      "number   – nível mínimo para pegar a quest",
  imageRequired: "boolean  – se requer comprovante (print)",
  expiresAt:     "number?  – timestamp de expiração (null = sem prazo)",
  eventName:     "string?  – nome do evento (somente tipo event)",
  isActive:      "boolean  – true = disponível para usuários",
  created_by:    "string   – UID do admin que criou",
  created_at:    "number   – timestamp Unix (ms)",
  updated_at:    "number?  – timestamp Unix (ms)",
};

/* ════════════════════════════════════════════════════════════════
   /userQuests/{uid}/{userQuestId}

   REGRA: Uma quest pode ser feita APENAS 1 vez por usuário.
   Quests rejeitadas reativam a MESMA entrada (sem duplicata).
   "Minhas Quests" mostra TODAS as entradas de todos os status.
════════════════════════════════════════════════════════════════ */
export const USER_QUEST_SCHEMA = {
  questId:     "string   – ID da quest referenciada",
  questTitle:  "string   – título snapshot (não muda se a quest for editada)",
  questType:   "string   – tipo snapshot ('daily', 'weekly', etc.)",
  rewardCoins: "number   – recompensa snapshot",
  rewardXP:    "number   – XP snapshot",
  status:      "string   – 'active' | 'pending_review' | 'completed' | 'rejected'",
  printUrl:    "string?  – base64 JPEG comprimido do comprovante",
  reviewNote:  "string?  – nota do admin ao rejeitar",
  takenAt:     "number   – timestamp de quando pegou a quest",
  submittedAt: "number?  – timestamp de quando enviou o comprovante",
};

/* Status flow:
   active → (enviar print) → pending_review → (aprovado) → completed
                                             → (rejeitado) → rejected
   rejected → (reenviar = reativa entry) → active
*/

/* ════════════════════════════════════════════════════════════════
   /submissions/{submissionId}
════════════════════════════════════════════════════════════════ */
export const SUBMISSION_SCHEMA = {
  uid:         "string   – UID do usuário",
  userQuestId: "string   – ID da entrada em /userQuests/{uid}",
  questId:     "string   – ID da quest",
  questTitle:  "string   – título snapshot",
  rewardCoins: "number   – recompensa snapshot",
  rewardXP:    "number   – XP snapshot",
  printUrl:    "string   – base64 JPEG comprimido",
  status:      "string   – 'pending' | 'approved' | 'rejected'",
  reviewedBy:  "string?  – UID do admin que revisou",
  reviewedAt:  "number?  – timestamp da revisão",
  reviewNote:  "string?  – motivo da rejeição",
  created_at:  "number   – timestamp de criação",
};

/* ════════════════════════════════════════════════════════════════
   /achievements/{achievementId}

   Conquistas são gerenciadas pelo admin e concedidas
   automaticamente quando o usuário atinge os critérios.
════════════════════════════════════════════════════════════════ */
export const ACHIEVEMENT_SCHEMA = {
  name:           "string  – nome da conquista",
  icon:           "string  – emoji do ícone (ex: '🏆', '⚔️')",
  description:    "string  – descrição detalhada",
  level:          "number  – nível mínimo do usuário para ganhar",
  questsRequired: "number  – quantidade de quests concluídas necessárias",
  xpBonus:        "number  – XP bônus concedido ao ganhar a conquista",
  coinsBonus:     "number  – moedas bônus concedidas ao ganhar",
  created_at:     "number  – timestamp Unix (ms)",
  updated_at:     "number? – timestamp Unix (ms)",
};

/* ════════════════════════════════════════════════════════════════
   /rankings/{uid}
════════════════════════════════════════════════════════════════ */
export const RANKING_SCHEMA = {
  uid:          "string  – Firebase Auth UID",
  coinsTotal:   "number  – total acumulado de moedas",
  coinsDaily:   "number  – moedas do período diário (reset manual)",
  coinsWeekly:  "number  – moedas do período semanal (reset manual)",
  coinsMonthly: "number  – moedas do período mensal (reset manual)",
  updated_at:   "number  – timestamp da última atualização",
};

/* ════════════════════════════════════════════════════════════════
   /meta/{key}
════════════════════════════════════════════════════════════════ */
export const META_SCHEMA = {
  lastReset_daily:   "number – timestamp do último reset diário",
  lastReset_weekly:  "number – timestamp do último reset semanal",
  lastReset_monthly: "number – timestamp do último reset mensal",
};

/* ════════════════════════════════════════════════════════════════
   REGRAS DE SEGURANÇA (resumo)
════════════════════════════════════════════════════════════════

  /users:
    .read  → auth !== null
    /{uid}: .write → uid === auth.uid || auth.uid === ADMIN_UID
    /{uid}/role: .write → auth.uid === ADMIN_UID

  /quests:
    .read  → auth !== null
    /{questId}: .write → auth.uid === ADMIN_UID
    /{questId}/currentUsers: .write → auth !== null  (incrementado ao pegar quest)

  /userQuests/{uid}:
    .read  → auth.uid === uid || auth.uid === ADMIN_UID
    .write → auth.uid === uid || auth.uid === ADMIN_UID

  /submissions:
    .read  → auth !== null
    .write → auth !== null

  /achievements:
    .read  → auth !== null
    .write → auth.uid === ADMIN_UID

  /rankings:
    .read  → auth !== null
    .write → auth !== null

  /meta:
    .read  → auth !== null
    .write → auth.uid === ADMIN_UID

════════════════════════════════════════════════════════════════ */

/* ════════════════════════════════════════════════════════════════
   API DE ACESSO AOS DADOS  (database.js v5.0)
════════════════════════════════════════════════════════════════

  §1 HELPERS
    snapToArray(snap)            → array[]    (robusto, com fallback)
    snapToObj(snap)              → object     (para lookup rápido)
    now()                        → number     (timestamp ms)

  §2 USERS (one-shot get)
    proc_getUser(uid)            → User | null
    proc_upsertUser(uid, data)   → User        (cria ou atualiza)
    proc_updateNickname(uid, n)  → void
    proc_updateUserIcon(uid, i)  → void
    proc_updateUserRole(uid, r)  → void
    proc_getAllUsers()            → User[]     (TODOS os usuários)
    proc_awardUser(uid, c, xp)   → void       (dá moedas/XP + rank + achievements)

  §3 QUESTS (one-shot get)
    proc_getQuest(id)            → Quest | null
    proc_getAllQuests()           → Quest[]    (TODAS: ativas + inativas)
    proc_getActiveQuests(type?)  → Quest[]    (apenas isActive !== false)
    proc_createQuest(data, uid)  → Quest
    proc_updateQuest(id, data)   → void
    proc_toggleQuest(id)         → boolean    (novo status)
    proc_deleteQuest(id)         → void

  §4 USER-QUESTS (one-shot get)
    proc_getUserQuests(uid)             → UserQuest[]  (TODAS as entradas)
    proc_getUserQuestByQuestId(uid, id) → UserQuest | null
    proc_takeQuest(uid, questId)        → {id}         (1x por quest)

  §5 SUBMISSIONS (one-shot get)
    proc_submitQuestProof(uid, uqId, url) → {submissionId}
    proc_getPendingSubmissions()          → Submission[]  (apenas pendentes)
    proc_getAllSubmissions()              → Submission[]  (todas)
    proc_approveSubmission(id, adminUid) → void
    proc_rejectSubmission(id, adminUid, note) → void

  §6 ACHIEVEMENTS (one-shot get)
    proc_getAllAchievements()          → Achievement[]
    proc_createAchievement(data)       → Achievement
    proc_updateAchievement(id, data)   → void
    proc_deleteAchievement(id)         → void
    proc_checkAndAwardAchievements(uid, completedCount, level) → void

  §7 RANKINGS (one-shot get)
    proc_updateRankingEntry(uid, total, daily, weekly, monthly) → void
    proc_getRanking(period, limit)   → RankingEntry[]  (limit=0 = todos)
    proc_resetRanking(period)        → void

  §8 STATS
    proc_getUserStats(uid)           → UserStats

  §9 REAL-TIME LISTENERS (onValue)
    listenQuests(callback)              → unsubscribe()
    listenUserQuests(uid, callback)     → unsubscribe()
    listenSubmissions(callback)         → unsubscribe()
    listenUsers(callback)               → unsubscribe()
    listenAchievements(callback)        → unsubscribe()
    listenRanking(period, callback)     → unsubscribe()

════════════════════════════════════════════════════════════════ */

/* ════════════════════════════════════════════════════════════════
   ARQUITETURA DE LISTENERS (onValue)
════════════════════════════════════════════════════════════════

  O módulo database.js v5.0 fornece dois modos de acesso:

  MODO 1 – One-shot (get):
    • Funções proc_* fazem uma leitura única.
    • Útil para leituras pontuais (ex: abrir modal de edição).

  MODO 2 – Real-time (onValue / listen*):
    • Funções listen* inscrevem um callback no Firebase.
    • O callback é chamado imediatamente com os dados atuais
      e novamente sempre que os dados mudarem no banco.
    • Cada função retorna um `unsubscribe()` para cancelar.
    • Os módulos js/ utilizam listeners ativos em cada página
      para garantir que as listas sejam sempre completas e
      atualizadas em tempo real.

  EXEMPLO DE USO:
    const unsub = listenQuests((quests) => {
      console.log("Total quests:", quests.length);
      renderQuestList(quests);
    });
    // Quando a página for fechada:
    unsub();

════════════════════════════════════════════════════════════════ */

/* ════════════════════════════════════════════════════════════════
   REGRAS DE NEGÓCIO
════════════════════════════════════════════════════════════════

  1. QUEST 1x POR USUÁRIO
     • Cada usuário pode pegar uma quest apenas UMA VEZ.
     • Tentativa de pegar novamente retorna erro específico:
       - "active"         → "Você já está fazendo esta quest!"
       - "pending_review" → "Seu comprovante está em análise."
       - "completed"      → "Você já completou esta quest."
       - "rejected"       → Reativa a mesma entrada (sem duplicata).

  2. MINHAS QUESTS = TODAS AS ENTRADAS
     • getUserQuests / listenUserQuests retornam TODAS as entradas
       do usuário, sem filtro por status.
     • O front-end filtra por status se necessário.

  3. ADMIN VÊ TODAS AS QUESTS
     • proc_getAllQuests / listenQuests (no admin) retorna quests
       ativas E inativas.
     • Usuários veem apenas quests com isActive !== false.

  4. CONQUISTAS AUTOMÁTICAS
     • proc_checkAndAwardAchievements é chamado automaticamente
       após proc_awardUser (ao aprovar submissão).
     • Verifica se o usuário atingiu os critérios de qualquer
       conquista ainda não obtida.
     • Bônus de conquistas são adicionados às moedas/XP do usuário.

  5. LISTAS COMPLETAS COM FALLBACK
     • snapToArray usa snap.forEach como método primário.
     • Se forEach retornar array vazio (bug Firebase SDK),
       faz fallback para Object.entries(snap.val()).
     • Garante que TODOS os itens são retornados independente
       do número de filhos (0, 1 ou N).

════════════════════════════════════════════════════════════════ */

export default {
  version:       FIREBASE_DATATIME_VERSION,
  generatedAt:   GENERATED_AT,
  schemas: {
    user:        USER_SCHEMA,
    quest:       QUEST_SCHEMA,
    userQuest:   USER_QUEST_SCHEMA,
    submission:  SUBMISSION_SCHEMA,
    achievement: ACHIEVEMENT_SCHEMA,
    ranking:     RANKING_SCHEMA,
    meta:        META_SCHEMA,
  }
};
