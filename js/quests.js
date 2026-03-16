/* ================================================================
   js/quests.js  –  Pegar quests + Minhas Quests
   ----------------------------------------------------------------
   • Cada quest pode ser feita 1x por usuário.
   • Quests concluídas não podem ser repetidas.
   • Quests rejeitadas: mesmo botão reativa a entrada para reenvio.
   • "Minhas Quests" exibe TODAS as entradas (sem deduplicar).
   • Usa onValue (tempo real) para atualização automática das listas.
   ================================================================ */

import "../firebase/session-manager.js";
import {
  getQuests, getUserQuests, takeQuest as fbTakeQuest,
  submitQuestProof,
  listenQuests, listenUserQuests
} from "../firebase/database.js";

/* ─── Estado local ──────────────────────────────────────────── */
let _currentQuestFilter   = "all";
let _currentMyQuestFilter = "all";
let _selectedUQId         = null;
let _allLoadedQuests      = [];   // cache para busca/filtro client-side
let _unsubQuests          = null; // unsubscribe listener quests
let _unsubUserQuests      = null; // unsubscribe listener user-quests
let _allUserQuests        = [];   // cache user-quests para merge

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

  // Cancelar listener anterior se existir
  if (_unsubQuests) { _unsubQuests(); _unsubQuests = null; }
  if (_unsubUserQuests) { _unsubUserQuests(); _unsubUserQuests = null; }

  /* Carrega user-quests uma vez (será atualizado por listener) */
  if (uid) {
    _allUserQuests = await getUserQuests(uid).catch(() => []);
    // Listener em tempo real para user-quests
    _unsubUserQuests = listenUserQuests(uid, (uqs) => {
      _allUserQuests = uqs;
      _renderFromCache(grid);
    });
  }

  /* Listener em tempo real para quests */
  _unsubQuests = listenQuests((allQuests) => {
    // Filtrar por tipo se necessário
    const type = _currentQuestFilter !== "all" ? _currentQuestFilter : null;
    const quests = type ? allQuests.filter(q => q.type === type) : allQuests;
    // Apenas quests ativas para usuários
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

    /* Mapeia questId → entrada do usuário */
    const uqByQuestId = {};
    _allUserQuests.forEach(uq => {
      if (!uqByQuestId[uq.questId] || (uq.takenAt || 0) > (uqByQuestId[uq.questId].takenAt || 0)) {
        uqByQuestId[uq.questId] = uq;
      }
    });

    const questsWithStatus = active.map(q => {
      const uq = uqByQuestId[q.id] || null;
      return {
        ...q,
        userStatus:  uq?.status || null,
        userQuestId: uq?.id     || null,
        isAvailable: !q.maxUsers || (q.currentUsers || 0) < q.maxUsers
      };
    });

    _allLoadedQuests = questsWithStatus;
    _renderQuestGrid(questsWithStatus, grid);

    /* Badge: quests disponíveis para pegar */
    const canTake = q => (!q.userStatus || q.userStatus === "rejected") && q.isAvailable;
    const available = questsWithStatus.filter(canTake).length;
    _set("availableBadge", el => el.textContent = available > 0 ? available : "");
  });

  // Error handler
  window.addEventListener("unhandledrejection", e => {
    if (e.reason?.message?.includes("PERMISSION_DENIED")) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
        <i class="fas fa-exclamation-triangle"></i>
        <h3>Sem permissão</h3>
        <p>Atualize as regras do Firebase no Console.</p></div>`;
    }
  }, { once: true });
};

/** Re-renderiza a grid com o cache atual (chamado quando userQuests muda) */
function _renderFromCache(grid) {
  if (!_allLoadedQuests.length) return;
  const uqByQuestId = {};
  _allUserQuests.forEach(uq => {
    if (!uqByQuestId[uq.questId] || (uq.takenAt || 0) > (uqByQuestId[uq.questId].takenAt || 0)) {
      uqByQuestId[uq.questId] = uq;
    }
  });
  const updated = _allLoadedQuests.map(q => ({
    ...q,
    userStatus:  (uqByQuestId[q.id] || null)?.status || null,
    userQuestId: (uqByQuestId[q.id] || null)?.id     || null,
  }));
  _allLoadedQuests = updated;
  _renderQuestGrid(updated, grid);
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
  if (q.userStatus === "active")
    btnHtml = `<button class="btn-take-quest taken" disabled>📜 Em progresso</button>`;
  else if (q.userStatus === "pending_review")
    btnHtml = `<button class="btn-take-quest pending" disabled>⏳ Em análise</button>`;
  else if (q.userStatus === "completed")
    btnHtml = `<button class="btn-take-quest completed" disabled>✅ Concluída</button>`;
  else if (q.userStatus === "rejected" && q.isAvailable)
    btnHtml = `<button class="btn-take-quest retry"
                 data-action="resubmit"
                 data-uqid="${q.userQuestId}"
                 data-title="${escapeHtml(q.title)}">
                 🔄 Reenviar Print</button>`;
  else if (q.userStatus === "rejected" && !q.isAvailable)
    btnHtml = `<button class="btn-take-quest taken" disabled>❌ Rejeitada / Esgotada</button>`;
  else if (!q.isAvailable)
    btnHtml = `<button class="btn-take-quest taken" disabled>🔒 Esgotada</button>`;
  else
    btnHtml = `<button class="btn-take-quest" data-action="take" data-id="${q.id}">⚔️ Pegar Quest</button>`;

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
    // O listener onValue vai atualizar automaticamente as listas
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

  // Cancelar listener anterior
  if (_unsubMyQuests) { _unsubMyQuests(); _unsubMyQuests = null; }

  /* Listener em tempo real para as quests do usuário */
  _unsubMyQuests = listenUserQuests(uid, (allUQs) => {
    // Atualizar cache compartilhado
    _allUserQuests = allUQs;

    /* Ordenar por takenAt decrescente */
    const sorted = [...allUQs].sort((a, b) => (b.takenAt || 0) - (a.takenAt || 0));

    /* Atualizar badge: ativas + em análise */
    const badgeCount = sorted.filter(q => q.status === "active" || q.status === "pending_review").length;
    _set("pendingBadge", el => el.textContent = badgeCount > 0 ? badgeCount : "");

    /* Filtrar por status */
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
              <i class="fas fa-upload"></i> Enviar Print</button>`;
  } else if (uq.status === "pending_review") {
    btn = `<button class="btn-submit-quest pending" disabled>
              <i class="fas fa-clock"></i> Aguardando</button>`;
  } else if (uq.status === "completed") {
    btn = `<button class="btn-submit-quest done" disabled>
              <i class="fas fa-check"></i> +${uq.rewardCoins || 0} moedas</button>`;
  } else if (uq.status === "rejected") {
    btn = `<button class="btn-submit-quest"
              data-id="${uq.id}"
              data-title="${escapeHtml(uq.questTitle || "")}">
              <i class="fas fa-redo"></i> Reenviar Print</button>`;
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
   MODAL DE ENVIO DE PRINT
════════════════════════════════════════════════════════════════ */
function _openSubmitModal(userQuestId, questTitle) {
  _selectedUQId = userQuestId;
  const modal = document.getElementById("submitModal");
  if (!modal) return;
  modal.style.display = "flex";
  _set("submitQuestTitle", el => el.textContent = `Quest: ${questTitle}`);
  const preview = document.getElementById("imagePreview");
  const upload  = document.getElementById("uploadArea");
  const input   = document.getElementById("printInput");
  if (preview) preview.style.display = "none";
  if (upload)  upload.style.display  = "block";
  if (input)   input.value           = "";
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

  /* ── Upload / drag-drop ─────────────────────────────────── */
  const uploadArea   = document.getElementById("uploadArea");
  const printInput   = document.getElementById("printInput");
  const imagePreview = document.getElementById("imagePreview");
  const previewImg   = document.getElementById("previewImg");
  const removeBtn    = document.getElementById("removeImgBtn");

  uploadArea?.addEventListener("click",    () => printInput?.click());
  uploadArea?.addEventListener("dragover", e  => { e.preventDefault(); uploadArea.classList.add("drag-over"); });
  uploadArea?.addEventListener("dragleave", () => uploadArea.classList.remove("drag-over"));
  uploadArea?.addEventListener("drop",     e  => {
    e.preventDefault(); uploadArea.classList.remove("drag-over");
    if (e.dataTransfer.files[0]) _handleFile(e.dataTransfer.files[0]);
  });
  printInput?.addEventListener("change", e => { if (e.target.files[0]) _handleFile(e.target.files[0]); });
  removeBtn?.addEventListener("click", () => {
    if (printInput)   printInput.value           = "";
    if (imagePreview) imagePreview.style.display = "none";
    if (uploadArea)   uploadArea.style.display   = "block";
    if (previewImg)   previewImg.src             = "";
  });

  function _handleFile(file) {
    if (!file.type.startsWith("image/"))
      return window.showToast?.("Apenas imagens são permitidas!", "error");
    if (file.size > 5 * 1024 * 1024)
      return window.showToast?.("Imagem muito grande (máx. 5MB)", "error");
    const reader = new FileReader();
    reader.onload = e => {
      if (previewImg)   previewImg.src             = e.target.result;
      if (imagePreview) imagePreview.style.display = "block";
      if (uploadArea)   uploadArea.style.display   = "none";
    };
    reader.readAsDataURL(file);
  }

  /* ── Enviar comprovante ─────────────────────────────────── */
  const confirmBtn  = document.getElementById("confirmSubmitBtn");
  const confirmHTML = confirmBtn?.innerHTML || "Enviar";
  confirmBtn?.addEventListener("click", async () => {
    if (!_selectedUQId) return;
    const file = printInput?.files[0];
    if (!file) return window.showToast?.("Selecione uma imagem como comprovante!", "warning");

    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
    try {
      const uid = window.RPG?.getFbUser()?.uid;
      if (!uid) throw new Error("Não logado");
      const printUrl = await _compressAndEncode(file);
      await submitQuestProof(uid, _selectedUQId, printUrl);
      window.showToast?.("✅ Comprovante enviado! Aguardando revisão. ⏳", "success");
      closeMdl();
      // Listeners onValue vão atualizar automaticamente
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
      if (si) { si.value = ""; }
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
  });
  clearSearch?.addEventListener("click", () => {
    if (questSearch) questSearch.value = "";
    if (clearSearch) clearSearch.style.display = "none";
    _renderQuestGrid(_allLoadedQuests, questsGrid);
  });

  /* ── Filtros: Minhas Quests ─────────────────────────────── */
  document.querySelectorAll("#page-myquests .filter-btn[data-filter]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#page-myquests .filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      _currentMyQuestFilter = btn.dataset.filter;
      // Re-filtra do cache em memória sem nova requisição
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
function _compressAndEncode(file) {
  return new Promise((resolve, reject) => {
    const img    = new Image();
    const reader = new FileReader();
    reader.onload  = e => { img.src = e.target.result; };
    reader.onerror = reject;
    reader.readAsDataURL(file);
    img.onload = () => {
      const MAX = 800;
      let w = img.width, h = img.height;
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
        else       { w = Math.round(w * MAX / h); h = MAX; }
      }
      const canvas = document.createElement("canvas");
      canvas.width  = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.75));
    };
    img.onerror = reject;
  });
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
