/* ================================================================
   js/quests.js  –  Pegar quests + Minhas Quests  v6.0
   ----------------------------------------------------------------
   • Comprovante via LINK (prnt.sc) em vez de upload de imagem.
   • Quests concluídas mostram COUNTDOWN até o próximo reset:
       - Diária  → meia-noite do próximo dia
       - Semanal → domingo meia-noite
       - Mensal  → dia 1 do próximo mês 00:00
   • Após o reset, botão volta a "Pegar Quest".
   • Usa onValue (tempo real) para atualização automática.
   ================================================================ */

import "../firebase/session-manager.js";
import {
  getUserQuests, takeQuest as fbTakeQuest,
  submitQuestProof,
  listenQuests, listenUserQuests
} from "../firebase/database.js";

/* ─── Estado local ──────────────────────────────────────────── */
let _currentQuestFilter   = "all";
let _currentMyQuestFilter = "all";
let _selectedUQId         = null;
let _allLoadedQuests      = [];
let _unsubQuests          = null;
let _unsubUserQuests      = null;
let _allUserQuests        = [];

/* ════════════════════════════════════════════════════════════════
   COOLDOWN HELPERS
════════════════════════════════════════════════════════════════ */

/**
 * Calcula o próximo timestamp de reset para cada tipo de quest.
 * Retorna milliseconds (Unix) do próximo reset.
 */
function _getNextReset(questType) {
  const now = new Date();
  let reset;

  if (questType === "daily") {
    // Próxima meia-noite (horário local)
    reset = new Date(now);
    reset.setDate(reset.getDate() + 1);
    reset.setHours(0, 0, 0, 0);

  } else if (questType === "weekly") {
    // Próximo domingo às 00:00
    reset = new Date(now);
    const dayOfWeek = reset.getDay(); // 0=Sun, 1=Mon...
    const daysUntilSunday = dayOfWeek === 0 ? 7 : 7 - dayOfWeek;
    reset.setDate(reset.getDate() + daysUntilSunday);
    reset.setHours(0, 0, 0, 0);

  } else if (questType === "monthly") {
    // Dia 1 do próximo mês às 00:00
    reset = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);

  } else {
    // Eventos não têm reset automático
    return null;
  }

  return reset.getTime();
}

/**
 * Verifica se uma quest completada já passou do seu cooldown.
 * @param {object} uq - userQuest com .questType e .completedAt
 * @returns {boolean} true se o cooldown já passou (pode refazer)
 */
function _isCooldownOver(uq) {
  if (!uq || uq.status !== "completed") return false;
  const completedAt = uq.completedAt || uq.takenAt || 0;
  const questType   = uq.questType   || "event";

  if (questType === "event") return false; // eventos nunca resetam

  // Calcula o reset que ocorreu APÓS completedAt
  const completedDate = new Date(completedAt);
  let reset;

  if (questType === "daily") {
    // Reset = meia-noite do dia seguinte ao completedAt
    reset = new Date(completedDate);
    reset.setDate(reset.getDate() + 1);
    reset.setHours(0, 0, 0, 0);

  } else if (questType === "weekly") {
    // Reset = próximo domingo após completedAt
    reset = new Date(completedDate);
    const dow = reset.getDay();
    const daysUntilSunday = dow === 0 ? 7 : 7 - dow;
    reset.setDate(reset.getDate() + daysUntilSunday);
    reset.setHours(0, 0, 0, 0);

  } else if (questType === "monthly") {
    // Reset = dia 1 do mês seguinte ao completedAt
    reset = new Date(completedDate.getFullYear(), completedDate.getMonth() + 1, 1, 0, 0, 0, 0);
  }

  return reset ? Date.now() >= reset.getTime() : false;
}

/**
 * Formata o tempo restante até o próximo reset em string legível.
 */
function _formatCountdown(ms) {
  if (ms <= 0) return "Reiniciando...";
  const totalSec = Math.floor(ms / 1000);
  const days     = Math.floor(totalSec / 86400);
  const hours    = Math.floor((totalSec % 86400) / 3600);
  const mins     = Math.floor((totalSec % 3600)  / 60);
  const secs     = totalSec % 60;

  if (days > 0)  return `${days}d ${String(hours).padStart(2,"0")}h ${String(mins).padStart(2,"0")}m`;
  if (hours > 0) return `${String(hours).padStart(2,"0")}h ${String(mins).padStart(2,"0")}m ${String(secs).padStart(2,"0")}s`;
  return `${String(mins).padStart(2,"0")}m ${String(secs).padStart(2,"0")}s`;
}

/* Intervalo global para atualizar countdowns na tela */
let _countdownInterval = null;

function _startCountdownTick() {
  if (_countdownInterval) clearInterval(_countdownInterval);
  _countdownInterval = setInterval(() => {
    document.querySelectorAll("[data-reset-at]").forEach(el => {
      const resetAt  = parseInt(el.dataset.resetAt, 10);
      const remaining = resetAt - Date.now();
      if (remaining <= 0) {
        // Cooldown acabou — recarrega a lista
        clearInterval(_countdownInterval);
        _countdownInterval = null;
        if (_unsubQuests || _unsubUserQuests) {
          // Os listeners onValue vão atualizar automaticamente
          // mas forçamos re-render com o cache
          const grid = document.getElementById("questsGrid");
          if (grid) _renderFromCache(grid);
        }
      } else {
        el.textContent = _formatCountdown(remaining);
      }
    });
  }, 1000);
}

/* ════════════════════════════════════════════════════════════════
   PEGAR QUESTS  –  carrega TODAS as quests ativas (tempo real)
════════════════════════════════════════════════════════════════ */
window.loadQuests = async function loadQuestsPage(filter) {
  if (filter !== undefined) _currentQuestFilter = filter;
  const grid = document.getElementById("questsGrid");
  if (!grid) return;

  grid.innerHTML = `<div class="loading-spinner" style="grid-column:1/-1">
    <i class="fas fa-spinner fa-spin"></i> Carregando quests...</div>`;

  const uid = window.RPG?.getFbUser()?.uid;

  if (_unsubQuests)     { _unsubQuests();     _unsubQuests = null; }
  if (_unsubUserQuests) { _unsubUserQuests(); _unsubUserQuests = null; }

  if (uid) {
    _allUserQuests = await getUserQuests(uid).catch(() => []);
    _unsubUserQuests = listenUserQuests(uid, (uqs) => {
      _allUserQuests = uqs;
      _renderFromCache(grid);
    });
  }

  _unsubQuests = listenQuests((allQuests) => {
    const type   = _currentQuestFilter !== "all" ? _currentQuestFilter : null;
    const quests = type ? allQuests.filter(q => q.type === type) : allQuests;
    const active = quests.filter(q => q.isActive !== false);

    if (active.length === 0) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
        <i class="fas fa-scroll"></i>
        <h3>Nenhuma quest disponível</h3>
        <p>Volte mais tarde para novas missões!</p></div>`;
      _set("availableBadge", el => el.textContent = "");
      _allLoadedQuests = [];
      return;
    }

    // Mapeia questId → entrada mais recente do usuário
    const uqByQuestId = _buildUqMap(_allUserQuests);

    const questsWithStatus = active.map(q => {
      const uq = uqByQuestId[q.id] || null;
      // Verifica se o cooldown já passou para quests concluídas
      const cooldownOver = uq ? _isCooldownOver(uq) : false;
      return {
        ...q,
        userStatus:    cooldownOver ? null : (uq?.status || null),
        userQuestId:   uq?.id        || null,
        completedAt:   uq?.completedAt || null,
        questType:     q.type,
        isAvailable:   !q.maxUsers || (q.currentUsers || 0) < q.maxUsers
      };
    });

    _allLoadedQuests = questsWithStatus;
    _renderQuestGrid(questsWithStatus, grid);

    const canTake  = q => (!q.userStatus || q.userStatus === "rejected") && q.isAvailable;
    const available = questsWithStatus.filter(canTake).length;
    _set("availableBadge", el => el.textContent = available > 0 ? available : "");

    _startCountdownTick();
  });

  window.addEventListener("unhandledrejection", e => {
    if (e.reason?.message?.includes("PERMISSION_DENIED")) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
        <i class="fas fa-exclamation-triangle"></i>
        <h3>Sem permissão</h3>
        <p>Atualize as regras do Firebase no Console.</p></div>`;
    }
  }, { once: true });
};

function _buildUqMap(allUserQuests) {
  const map = {};
  allUserQuests.forEach(uq => {
    const prev = map[uq.questId];
    if (!prev || (uq.takenAt || 0) > (prev.takenAt || 0)) map[uq.questId] = uq;
  });
  return map;
}

function _renderFromCache(grid) {
  if (!_allLoadedQuests.length) return;
  const uqByQuestId = _buildUqMap(_allUserQuests);
  const updated = _allLoadedQuests.map(q => {
    const uq = uqByQuestId[q.id] || null;
    const cooldownOver = uq ? _isCooldownOver(uq) : false;
    return {
      ...q,
      userStatus:  cooldownOver ? null : (uq?.status || null),
      userQuestId: uq?.id       || null,
      completedAt: uq?.completedAt || null,
    };
  });
  _allLoadedQuests = updated;
  _renderQuestGrid(updated, grid);
  _startCountdownTick();
}

/* ─── Render grid de quests ─────────────────────────────────── */
function _renderQuestGrid(list, grid) {
  if (!grid) return;
  if (!list || list.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <i class="fas fa-search"></i>
      <h3>Nenhuma quest encontrada</h3>
      <p>Tente outro filtro ou busca.</p></div>`;
    return;
  }
  grid.innerHTML = list.map(q => _renderQuestCard(q)).join("");

  grid.querySelectorAll('.btn-take-quest[data-action="take"]').forEach(btn =>
    btn.addEventListener("click", () => _doTakeQuest(btn.dataset.id)));

  grid.querySelectorAll('.btn-take-quest[data-action="resubmit"]').forEach(btn =>
    btn.addEventListener("click", () => _openSubmitModal(btn.dataset.uqid, btn.dataset.title)));
}

/* ─── Card de quest ─────────────────────────────────────────── */
function _renderQuestCard(q) {
  const typeLabels = {
    daily:   { label: "☀️ Diária",  css: "type-daily"   },
    weekly:  { label: "📅 Semanal", css: "type-weekly"  },
    monthly: { label: "🗓️ Mensal",  css: "type-monthly" },
    event:   { label: "⭐ Evento",  css: "type-event"   }
  };
  const typeInfo = typeLabels[q.type] || { label: q.type || "Quest", css: "" };

  let btnHtml = "";

  if (q.userStatus === "active") {
    btnHtml = `<button class="btn-take-quest taken" disabled>📜 Em progresso</button>`;

  } else if (q.userStatus === "pending_review") {
    btnHtml = `<button class="btn-take-quest pending" disabled>⏳ Em análise</button>`;

  } else if (q.userStatus === "completed") {
    // Mostra countdown até o próximo reset
    const resetAt = _getNextReset(q.type);
    if (!resetAt) {
      // Evento — sem reset
      btnHtml = `<button class="btn-take-quest completed" disabled>✅ Concluída</button>`;
    } else {
      const remaining = resetAt - Date.now();
      const countdownText = _formatCountdown(remaining);
      const resetLabel = {
        daily:   "Reinicia à meia-noite",
        weekly:  "Reinicia domingo",
        monthly: "Reinicia dia 1"
      }[q.type] || "Reinicia em breve";

      btnHtml = `
        <div class="quest-cooldown-wrap">
          <div class="quest-cooldown-label">
            <i class="fas fa-check-circle" style="color:var(--green)"></i>
            Concluída — ${resetLabel}
          </div>
          <div class="quest-countdown" data-reset-at="${resetAt}">
            ${countdownText}
          </div>
        </div>`;
    }

  } else if (q.userStatus === "rejected" && q.isAvailable) {
    btnHtml = `<button class="btn-take-quest retry"
                 data-action="resubmit"
                 data-uqid="${q.userQuestId}"
                 data-title="${escapeHtml(q.title)}">
                 🔄 Reenviar Print</button>`;

  } else if (q.userStatus === "rejected" && !q.isAvailable) {
    btnHtml = `<button class="btn-take-quest taken" disabled>❌ Rejeitada / Esgotada</button>`;

  } else if (!q.isAvailable) {
    btnHtml = `<button class="btn-take-quest taken" disabled>🔒 Esgotada</button>`;

  } else {
    btnHtml = `<button class="btn-take-quest" data-action="take" data-id="${q.id}">⚔️ Pegar Quest</button>`;
  }

  return `
    <div class="quest-card" data-type="${q.type}" data-id="${q.id}">
      <div class="quest-type-badge ${typeInfo.css}">${typeInfo.label}</div>
      <h3 class="quest-title">${escapeHtml(q.title)}</h3>
      <p class="quest-description">${escapeHtml(q.description)}</p>
      <div class="quest-meta">
        <span class="quest-reward">
          <i class="fas fa-coins"></i> +${q.rewardCoins || 0} moedas
          ${(q.rewardXP || 0) > 0 ? `<span class="xp-reward">+${q.rewardXP} XP</span>` : ""}
        </span>
        ${q.maxUsers ? `<span class="quest-slots"><i class="fas fa-users"></i> ${q.currentUsers||0}/${q.maxUsers}</span>` : ""}
        ${(q.minLevel || 1) > 1 ? `<span style="font-size:.75rem;color:var(--text-muted)"><i class="fas fa-lock"></i> Nível ${q.minLevel}+</span>` : ""}
        ${q.expiresAt ? `<span class="quest-expires"><i class="fas fa-clock"></i> Expira: ${new Date(q.expiresAt).toLocaleDateString("pt-BR")}</span>` : ""}
      </div>
      ${btnHtml}
    </div>`;
}

/* ─── Pegar quest ─────────────────────────────────────────── */
async function _doTakeQuest(questId) {
  const btn = document.querySelector(`.btn-take-quest[data-id="${questId}"]`);
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
  try {
    const uid = window.RPG?.getFbUser()?.uid;
    if (!uid) throw new Error("Não logado");
    await fbTakeQuest(uid, questId);
    window.showToast?.("🗡️ Quest aceita! Complete a missão!", "success");
  } catch (err) {
    window.showToast?.(err.message || "Erro ao pegar quest", "error");
    if (btn) { btn.disabled = false; btn.innerHTML = "⚔️ Pegar Quest"; }
  }
}

/* ════════════════════════════════════════════════════════════════
   MINHAS QUESTS  –  TODAS as entradas do usuário (tempo real)
════════════════════════════════════════════════════════════════ */
let _unsubMyQuests = null;

window.loadMyQuests = async function loadMyQuestsPage(filter) {
  if (filter !== undefined) _currentMyQuestFilter = filter;
  const list = document.getElementById("myQuestsList");
  if (!list) return;

  list.innerHTML = `<div class="loading-spinner">
    <i class="fas fa-spinner fa-spin"></i> Carregando suas quests...</div>`;

  const uid = window.RPG?.getFbUser()?.uid;
  if (!uid) {
    list.innerHTML = `<div class="empty-state">
      <i class="fas fa-lock"></i>
      <h3>Faça login para ver suas quests</h3></div>`;
    return;
  }

  if (_unsubMyQuests) { _unsubMyQuests(); _unsubMyQuests = null; }

  _unsubMyQuests = listenUserQuests(uid, (allUQs) => {
    _allUserQuests = allUQs;

    const sorted = [...allUQs].sort((a, b) => (b.takenAt || 0) - (a.takenAt || 0));

    const badgeCount = sorted.filter(q => q.status === "active" || q.status === "pending_review").length;
    _set("pendingBadge", el => el.textContent = badgeCount > 0 ? badgeCount : "");

    const filtered = _currentMyQuestFilter !== "all"
      ? sorted.filter(q => q.status === _currentMyQuestFilter)
      : sorted;

    if (filtered.length === 0) {
      list.innerHTML = `<div class="empty-state">
        <i class="fas fa-scroll"></i>
        <h3>Nenhuma quest aqui</h3>
        <p>${_currentMyQuestFilter === "all"
          ? 'Vá em "Pegar Quests" para começar!'
          : "Nenhuma quest com este filtro."}</p></div>`;
      return;
    }

    list.innerHTML = filtered.map(uq => _renderMyQuestItem(uq)).join("");

    list.querySelectorAll(".btn-submit-quest[data-id]").forEach(btn =>
      btn.addEventListener("click", () => _openSubmitModal(btn.dataset.id, btn.dataset.title)));
  });
};

/* ─── Item de Minhas Quests ──────────────────────────────── */
function _renderMyQuestItem(uq) {
  const statusLabels = {
    active:         { label: "Ativa",      css: "status-active" },
    pending_review: { label: "Em Análise", css: "status-pending_review" },
    completed:      { label: "Concluída",  css: "status-completed" },
    rejected:       { label: "Rejeitada",  css: "status-rejected" }
  };
  const typeColors = {
    daily:   "var(--orange)", weekly: "var(--blue)",
    monthly: "var(--purple-light)", event: "var(--gold)"
  };
  const s         = statusLabels[uq.status] || { label: uq.status, css: "" };
  const iconColor = typeColors[uq.questType] || "var(--gold)";

  let btn = "";
  if (uq.status === "active") {
    btn = `<button class="btn-submit-quest"
              data-id="${uq.id}"
              data-title="${escapeHtml(uq.questTitle || "")}">
              <i class="fas fa-link"></i> Enviar Link</button>`;
  } else if (uq.status === "pending_review") {
    btn = `<button class="btn-submit-quest pending" disabled>
              <i class="fas fa-clock"></i> Aguardando</button>`;
  } else if (uq.status === "completed") {
    // Mostra próximo reset no item de Minhas Quests
    const resetAt = _getNextReset(uq.questType);
    let resetInfo = "";
    if (resetAt && uq.questType !== "event") {
      const remaining = resetAt - Date.now();
      const label = { daily: "Reinicia à meia-noite", weekly: "Reinicia domingo", monthly: "Reinicia dia 1" }[uq.questType] || "";
      resetInfo = `<span class="my-quest-reset" title="${label}">
        <i class="fas fa-redo"></i>
        <span data-reset-at="${resetAt}">${_formatCountdown(remaining)}</span>
      </span>`;
    }
    btn = `<div class="my-quest-completed-wrap">
              <button class="btn-submit-quest done" disabled>
                <i class="fas fa-check"></i> +${uq.rewardCoins || 0} moedas
              </button>
              ${resetInfo}
           </div>`;
  } else if (uq.status === "rejected") {
    btn = `<button class="btn-submit-quest"
              data-id="${uq.id}"
              data-title="${escapeHtml(uq.questTitle || "")}">
              <i class="fas fa-redo"></i> Reenviar Link</button>`;
  }

  return `
    <div class="my-quest-item">
      <div class="my-quest-icon" style="background:${iconColor}22;color:${iconColor}">
        <i class="fas fa-scroll"></i>
      </div>
      <div class="my-quest-info">
        <div class="my-quest-title">${escapeHtml(uq.questTitle || "Quest")}</div>
        <div class="my-quest-meta">
          <span class="status-badge ${s.css}">${s.label}</span>
          <span><i class="fas fa-coins"></i> ${uq.rewardCoins || 0} moedas</span>
          ${(uq.rewardXP || 0) > 0
            ? `<span style="color:var(--purple-light);font-size:.75rem">
                 <i class="fas fa-star"></i> ${uq.rewardXP} XP</span>`
            : ""}
          <span style="font-size:.7rem;color:var(--text-muted)">
            ${uq.takenAt ? new Date(uq.takenAt).toLocaleDateString("pt-BR") : ""}
          </span>
          ${uq.reviewNote
            ? `<span class="review-note">❌ ${escapeHtml(uq.reviewNote)}</span>`
            : ""}
        </div>
      </div>
      ${btn}
    </div>`;
}

/* ════════════════════════════════════════════════════════════════
   MODAL DE ENVIO DE LINK (prnt.sc)
════════════════════════════════════════════════════════════════ */
function _openSubmitModal(userQuestId, questTitle) {
  _selectedUQId = userQuestId;
  const modal = document.getElementById("submitModal");
  if (!modal) return;
  modal.style.display = "flex";
  _set("submitQuestTitle", el => el.textContent = `Quest: ${questTitle}`);

  // Limpa campos
  const linkInput    = document.getElementById("printLinkInput");
  const previewWrap  = document.getElementById("linkPreviewWrap");
  const imagePreview = document.getElementById("imagePreview");
  const validMsg     = document.getElementById("linkValidationMsg");

  if (linkInput)    linkInput.value           = "";
  if (previewWrap)  previewWrap.style.display = "none";
  if (imagePreview) imagePreview.style.display = "none";
  if (validMsg)     validMsg.textContent       = "";
}

/* ════════════════════════════════════════════════════════════════
   DOMContentLoaded  –  binds modal + filtros + busca + refresh
════════════════════════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", () => {
  const submitModal = document.getElementById("submitModal");
  if (!submitModal) return;

  const closeMdl = () => {
    submitModal.style.display = "none";
    _selectedUQId = null;
  };

  document.getElementById("closeSubmitModal") ?.addEventListener("click", closeMdl);
  document.getElementById("cancelSubmitBtn")  ?.addEventListener("click", closeMdl);
  submitModal.addEventListener("click", e => { if (e.target === submitModal) closeMdl(); });

  /* ── Link input — preview ao digitar ───────────────────── */
  const linkInput    = document.getElementById("printLinkInput");
  const previewWrap  = document.getElementById("linkPreviewWrap");
  const previewOpen  = document.getElementById("linkPreviewOpen");
  const previewStatus = document.getElementById("linkPreviewStatus");
  const imagePreview = document.getElementById("imagePreview");
  const previewImg   = document.getElementById("previewImg");
  const validMsg     = document.getElementById("linkValidationMsg");

  linkInput?.addEventListener("input", () => {
    const val = linkInput.value.trim();
    if (!val) {
      if (previewWrap)  previewWrap.style.display  = "none";
      if (imagePreview) imagePreview.style.display = "none";
      if (validMsg)     validMsg.textContent        = "";
      return;
    }
    const isValid = _isValidPrintLink(val);
    if (isValid) {
      if (validMsg) { validMsg.textContent = ""; validMsg.className = "link-validation-msg"; }
      if (previewWrap) {
        previewWrap.style.display = "flex";
        if (previewOpen)  previewOpen.href = val;
        if (previewStatus) previewStatus.textContent = "✅ Link válido";
      }
      // Tenta mostrar preview da imagem (prnt.sc suporta imagem direta)
      const imgUrl = _getDirectImageUrl(val);
      if (imgUrl && imagePreview && previewImg) {
        previewImg.src = imgUrl;
        imagePreview.style.display = "block";
        previewImg.onerror = () => { imagePreview.style.display = "none"; };
      }
    } else {
      if (previewWrap) previewWrap.style.display = "none";
      if (imagePreview) imagePreview.style.display = "none";
      if (validMsg) {
        validMsg.textContent  = "⚠️ Use um link do prnt.sc (ex: https://prnt.sc/abc123)";
        validMsg.className    = "link-validation-msg invalid";
      }
    }
  });

  /* ── Enviar comprovante (link) ──────────────────────────── */
  const confirmBtn  = document.getElementById("confirmSubmitBtn");
  const confirmHTML = confirmBtn?.innerHTML || "Enviar";

  confirmBtn?.addEventListener("click", async () => {
    if (!_selectedUQId) return;
    const link = linkInput?.value.trim();
    if (!link)
      return window.showToast?.("Cole o link do seu print do prnt.sc!", "warning");
    if (!_isValidPrintLink(link))
      return window.showToast?.("Link inválido! Use um link do prnt.sc (https://prnt.sc/...)", "warning");

    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
    try {
      const uid = window.RPG?.getFbUser()?.uid;
      if (!uid) throw new Error("Não logado");
      await submitQuestProof(uid, _selectedUQId, link);
      window.showToast?.("✅ Comprovante enviado! Aguardando revisão. ⏳", "success");
      closeMdl();
      if (typeof window.loadStats === "function") await window.loadStats();
    } catch (err) {
      window.showToast?.(err.message || "Erro ao enviar comprovante", "error");
    } finally {
      if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.innerHTML = confirmHTML; }
    }
  });

  /* ── Filtros: Pegar Quests ──────────────────────────────── */
  document.querySelectorAll("#page-quests .filter-btn[data-filter]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#page-quests .filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const si = document.getElementById("questSearchInput");
      if (si) si.value = "";
      _set("clearQuestSearch", el => el.style.display = "none");
      window.loadQuests(btn.dataset.filter);
    });
  });

  /* ── Refresh manual ─────────────────────────────────────── */
  document.getElementById("refreshQuestsBtn")?.addEventListener("click", () => {
    const si = document.getElementById("questSearchInput");
    if (si) si.value = "";
    _set("clearQuestSearch", el => el.style.display = "none");
    window.loadQuests(_currentQuestFilter);
  });
  document.getElementById("refreshMyQuestsBtn")?.addEventListener("click", () =>
    window.loadMyQuests(_currentMyQuestFilter));
  document.getElementById("refreshStatsBtn")?.addEventListener("click", () =>
    window.loadStats?.());

  /* ── Busca ──────────────────────────────────────────────── */
  const questSearch = document.getElementById("questSearchInput");
  const clearSearch = document.getElementById("clearQuestSearch");
  const questsGrid  = document.getElementById("questsGrid");

  questSearch?.addEventListener("input", () => {
    const q = questSearch.value.trim().toLowerCase();
    if (clearSearch) clearSearch.style.display = q ? "flex" : "none";
    const filtered = !q
      ? _allLoadedQuests
      : _allLoadedQuests.filter(quest =>
          (quest.title || "").toLowerCase().includes(q) ||
          (quest.description || "").toLowerCase().includes(q));
    _renderQuestGrid(filtered, questsGrid);
    _startCountdownTick();
  });
  clearSearch?.addEventListener("click", () => {
    if (questSearch) questSearch.value = "";
    if (clearSearch) clearSearch.style.display = "none";
    _renderQuestGrid(_allLoadedQuests, questsGrid);
    _startCountdownTick();
  });

  /* ── Filtros: Minhas Quests ─────────────────────────────── */
  document.querySelectorAll("#page-myquests .filter-btn[data-filter]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#page-myquests .filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      _currentMyQuestFilter = btn.dataset.filter;
      const list = document.getElementById("myQuestsList");
      if (!list) return;
      const filtered = _currentMyQuestFilter !== "all"
        ? _allUserQuests.filter(q => q.status === _currentMyQuestFilter)
        : _allUserQuests;
      const sorted = [...filtered].sort((a, b) => (b.takenAt || 0) - (a.takenAt || 0));
      if (sorted.length === 0) {
        list.innerHTML = `<div class="empty-state">
          <i class="fas fa-scroll"></i>
          <h3>Nenhuma quest com este filtro</h3></div>`;
      } else {
        list.innerHTML = sorted.map(uq => _renderMyQuestItem(uq)).join("");
        list.querySelectorAll(".btn-submit-quest[data-id]").forEach(b =>
          b.addEventListener("click", () => _openSubmitModal(b.dataset.id, b.dataset.title)));
      }
    });
  });
});

/* ════════════════════════════════════════════════════════════════
   UTILITÁRIOS
════════════════════════════════════════════════════════════════ */

/**
 * Valida se o link é do prnt.sc ou lightshot.
 */
function _isValidPrintLink(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    // Aceita prnt.sc, i.imgur.com, imgur.com, gyazo.com, ibb.co, lightshot.app
    return (
      host === "prnt.sc" ||
      host.endsWith(".prnt.sc") ||
      host === "i.imgur.com" ||
      host === "imgur.com" ||
      host === "gyazo.com" ||
      host === "ibb.co" ||
      host === "i.ibb.co" ||
      host === "lightshot.app" ||
      host.endsWith(".lightshot.app")
    );
  } catch {
    return false;
  }
}

/**
 * Tenta obter URL direta da imagem para preview.
 * prnt.sc não tem CDN direto fácil, mas gyazo e imgur sim.
 */
function _getDirectImageUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    // Gyazo: https://gyazo.com/abc → https://i.gyazo.com/abc.png
    if (host === "gyazo.com") {
      const id = u.pathname.replace(/^\//, "").split(".")[0];
      return `https://i.gyazo.com/${id}.png`;
    }
    // Imgur: https://imgur.com/abc → https://i.imgur.com/abc.png
    if (host === "imgur.com") {
      const id = u.pathname.replace(/^\//, "").split(".")[0];
      return `https://i.imgur.com/${id}.png`;
    }
    if (host === "i.imgur.com" || host === "i.ibb.co") return url;
    return null; // prnt.sc não tem CDN direto público
  } catch {
    return null;
  }
}

function _set(id, fn) {
  const el = document.getElementById(id);
  if (el) try { fn(el); } catch (_) {}
}

function escapeHtml(text) {
  if (!text) return "";
  const d = document.createElement("div");
  d.appendChild(document.createTextNode(String(text)));
  return d.innerHTML;
}
