/* ================================================================
   js/quests.js  –  Pegar quests e enviar prints (100% Firebase)
   ================================================================ */

import "../firebase/session-manager.js";
import {
  getQuests, getUserQuests, takeQuest as fbTakeQuest,
  submitQuestProof
} from "../firebase/database.js";

/* ─── Estado local ──────────────────────────────────────────── */
let _currentFilter    = "all";
let _selectedUQId     = null;   // userQuestId selecionado para envio

/* ─── Carregar quests disponíveis ───────────────────────────── */
window.loadQuests = async function loadQuestsPage(filter = "all") {
  _currentFilter = filter;
  const grid = document.getElementById("questsGrid");
  if (!grid) return;

  grid.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Carregando quests...</div>';

  try {
    const uid    = window.RPG.getFbUser()?.uid;
    const type   = filter !== "all" ? filter : null;
    const quests = await getQuests(type);
    const myUQs  = uid ? await getUserQuests(uid) : [];

    if (quests.length === 0) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
        <i class="fas fa-scroll"></i><h3>Nenhuma quest disponível</h3>
        <p>Volte mais tarde para novas missões!</p></div>`;
      return;
    }

    // Mapear status do usuário para cada quest
    const questsWithStatus = quests.map(q => {
      const uq = myUQs.find(x => x.questId === q.id);
      return {
        ...q,
        userStatus:  uq?.status || null,
        isAvailable: !q.maxUsers || (q.currentUsers || 0) < q.maxUsers
      };
    });

    grid.innerHTML = questsWithStatus.map(q => _renderQuestCard(q)).join("");

    // Bind botões pegar quest
    grid.querySelectorAll('.btn-take-quest[data-action="take"]').forEach(btn => {
      btn.addEventListener("click", () => _doTakeQuest(btn.dataset.id));
    });

    // Badge de disponíveis
    const available = questsWithStatus.filter(q => !q.userStatus && q.isAvailable).length;
    const badge = document.getElementById("availableBadge");
    if (badge) badge.textContent = available > 0 ? available : "";

  } catch (err) {
    console.error("loadQuests error:", err);
    const msg = err.message || "Erro desconhecido";
    const isPermission = msg.includes("PERMISSION_DENIED") || msg.includes("permission");
    grid.innerHTML = `<div class="empty-state">
      <i class="fas fa-exclamation-triangle"></i>
      <h3>Erro ao carregar quests</h3>
      <p>${isPermission ? "Sem permissão: atualize as regras do Firebase no Console." : msg}</p>
    </div>`;
  }
};

/* ─── Render card de quest ────────────────────────────────────── */
function _renderQuestCard(q) {
  const typeLabels = {
    daily:   { label: "☀️ Diária",  css: "type-daily"   },
    weekly:  { label: "📅 Semanal", css: "type-weekly"  },
    monthly: { label: "🗓️ Mensal",  css: "type-monthly" },
    event:   { label: "⭐ Evento",  css: "type-event"   }
  };
  const typeInfo = typeLabels[q.type] || { label: q.type, css: "" };

  let btnHtml = "";
  if (q.userStatus === "active")
    btnHtml = `<button class="btn-take-quest taken" disabled>📜 Em progresso</button>`;
  else if (q.userStatus === "pending_review")
    btnHtml = `<button class="btn-take-quest pending" disabled>⏳ Em análise</button>`;
  else if (q.userStatus === "completed")
    btnHtml = `<button class="btn-take-quest completed" disabled>✅ Concluída</button>`;
  else if (q.userStatus === "rejected")
    btnHtml = `<button class="btn-take-quest taken" disabled>❌ Rejeitada</button>`;
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
          ${q.rewardXP > 0 ? `<span class="xp-reward">+${q.rewardXP} XP</span>` : ""}
        </span>
        ${q.maxUsers ? `<span class="quest-slots"><i class="fas fa-users"></i> ${q.currentUsers||0}/${q.maxUsers}</span>` : ""}
        ${q.minLevel > 1 ? `<span style="font-size:.75rem;color:var(--text-muted)"><i class="fas fa-lock"></i> Nível ${q.minLevel}+</span>` : ""}
        ${q.expiresAt ? `<span class="quest-expires"><i class="fas fa-clock"></i> Expira: ${new Date(q.expiresAt).toLocaleDateString("pt-BR")}</span>` : ""}
      </div>
      ${btnHtml}
    </div>`;
}

/* ─── Pegar quest ─────────────────────────────────────────────── */
async function _doTakeQuest(questId) {
  const btn = document.querySelector(`.btn-take-quest[data-id="${questId}"]`);
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }

  try {
    const uid = window.RPG.getFbUser()?.uid;
    if (!uid) throw new Error("Não logado");
    await fbTakeQuest(uid, questId);
    window.showToast?.("🗡️ Quest aceita! Complete a missão!", "success");
    await window.loadQuests(_currentFilter);
    await window.loadMyQuests();
  } catch (err) {
    window.showToast?.(err.message || "Erro ao pegar quest", "error");
    if (btn) { btn.disabled = false; btn.innerHTML = "⚔️ Pegar Quest"; }
  }
}

/* ─── Carregar minhas quests ─────────────────────────────────── */
window.loadMyQuests = async function loadMyQuestsPage(filter = "all") {
  const list = document.getElementById("myQuestsList");
  if (!list) return;

  list.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Carregando...</div>';

  try {
    const uid = window.RPG.getFbUser()?.uid;
    if (!uid) {
      list.innerHTML = '<div class="empty-state"><i class="fas fa-lock"></i><h3>Faça login para ver suas quests</h3></div>';
      return;
    }
    let myQuests = await getUserQuests(uid);
    if (filter !== "all") myQuests = myQuests.filter(q => q.status === filter);

    if (myQuests.length === 0) {
      list.innerHTML = `<div class="empty-state"><i class="fas fa-scroll"></i>
        <h3>Nenhuma quest aqui</h3>
        <p>Vá em "Pegar Quests" para começar!</p></div>`;
      return;
    }

    list.innerHTML = myQuests.map(uq => _renderMyQuestItem(uq)).join("");

    list.querySelectorAll(".btn-submit-quest").forEach(btn => {
      btn.addEventListener("click", () => _openSubmitModal(btn.dataset.id, btn.dataset.title));
    });

    // Atualizar badge de ativas
    const pendingBadge = document.getElementById("pendingBadge");
    if (pendingBadge) {
      const active = myQuests.filter(q => q.status === "active").length;
      pendingBadge.textContent = active > 0 ? active : "";
    }

  } catch (err) {
    console.error("loadMyQuests error:", err);
    const msg = err.message || "Erro desconhecido";
    const isPermission = msg.includes("PERMISSION_DENIED") || msg.includes("permission");
    list.innerHTML = `<div class="empty-state">
      <i class="fas fa-exclamation-triangle"></i>
      <h3>Erro ao carregar suas quests</h3>
      <p>${isPermission ? "Sem permissão: atualize as regras do Firebase no Console." : msg}</p>
    </div>`;
  }
};

/* ─── Render item de minha quest ─────────────────────────────── */
function _renderMyQuestItem(uq) {
  const statusLabels = {
    active:         { label: "Ativa",       css: "status-active" },
    pending_review: { label: "Em Análise",  css: "status-pending_review" },
    completed:      { label: "Concluída",   css: "status-completed" },
    rejected:       { label: "Rejeitada",   css: "status-rejected" },
    failed:         { label: "Falhou",      css: "status-failed" }
  };
  const typeColors = {
    daily: "var(--orange)", weekly: "var(--blue)",
    monthly: "var(--purple-light)", event: "var(--gold)"
  };
  const s = statusLabels[uq.status] || { label: uq.status, css: "" };
  const iconColor = typeColors[uq.questType] || "var(--gold)";

  let btn = "";
  if (uq.status === "active") {
    btn = `<button class="btn-submit-quest" data-id="${uq.id}" data-title="${escapeHtml(uq.questTitle||"")}">
      <i class="fas fa-upload"></i> Enviar Print</button>`;
  } else if (uq.status === "pending_review") {
    btn = `<button class="btn-submit-quest" style="background:rgba(249,115,22,.15);color:var(--orange)" disabled>
      <i class="fas fa-clock"></i> Aguardando</button>`;
  } else if (uq.status === "completed") {
    btn = `<button class="btn-submit-quest" style="background:rgba(34,197,94,.15);color:var(--green)" disabled>
      <i class="fas fa-check"></i> +${uq.rewardCoins||0} moedas</button>`;
  } else if (uq.status === "rejected") {
    btn = `<button class="btn-submit-quest" style="background:rgba(239,68,68,.15);color:var(--red)" disabled>
      <i class="fas fa-times"></i> Rejeitada</button>`;
  }

  return `
    <div class="my-quest-item">
      <div class="my-quest-icon" style="color:${iconColor}">
        <i class="fas fa-scroll"></i>
      </div>
      <div class="my-quest-info">
        <div class="my-quest-title">${escapeHtml(uq.questTitle || "Quest")}</div>
        <div class="my-quest-meta">
          <span class="status-badge ${s.css}">${s.label}</span>
          <span><i class="fas fa-coins"></i> ${uq.rewardCoins||0} moedas</span>
          <span style="font-size:.7rem;color:var(--text-muted)">
            ${uq.takenAt ? new Date(uq.takenAt).toLocaleDateString("pt-BR") : ""}
          </span>
          ${uq.reviewNote ? `<span style="color:var(--red);font-size:.75rem">❌ ${escapeHtml(uq.reviewNote)}</span>` : ""}
        </div>
      </div>
      ${btn}
    </div>`;
}

/* ─── Modal de envio de print ─────────────────────────────────── */
function _openSubmitModal(userQuestId, questTitle) {
  _selectedUQId = userQuestId;
  const modal = document.getElementById("submitModal");
  if (!modal) return;
  modal.style.display = "flex";
  const titleEl = document.getElementById("submitQuestTitle");
  if (titleEl) titleEl.textContent = `Quest: ${questTitle}`;
  const preview = document.getElementById("imagePreview");
  const upload  = document.getElementById("uploadArea");
  const input   = document.getElementById("printInput");
  if (preview) preview.style.display = "none";
  if (upload)  upload.style.display  = "block";
  if (input)   input.value = "";
}

/* ─── DOMContentLoaded: binds de modal + filtros ─────────────── */
document.addEventListener("DOMContentLoaded", () => {
  const submitModal  = document.getElementById("submitModal");
  if (!submitModal) return;

  const closeMdl = () => {
    submitModal.style.display = "none";
    _selectedUQId = null;
  };

  document.getElementById("closeSubmitModal")?.addEventListener("click", closeMdl);
  document.getElementById("cancelSubmitBtn") ?.addEventListener("click", closeMdl);
  submitModal.addEventListener("click", e => { if (e.target === submitModal) closeMdl(); });

  const uploadArea   = document.getElementById("uploadArea");
  const printInput   = document.getElementById("printInput");
  const imagePreview = document.getElementById("imagePreview");
  const previewImg   = document.getElementById("previewImg");
  const removeBtn    = document.getElementById("removeImgBtn");

  uploadArea?.addEventListener("click",    () => printInput?.click());
  uploadArea?.addEventListener("dragover", e  => { e.preventDefault(); uploadArea.classList.add("drag-over"); });
  uploadArea?.addEventListener("dragleave",()  => uploadArea.classList.remove("drag-over"));
  uploadArea?.addEventListener("drop",     e  => {
    e.preventDefault(); uploadArea.classList.remove("drag-over");
    if (e.dataTransfer.files[0]) _handleFile(e.dataTransfer.files[0]);
  });
  printInput?.addEventListener("change", e => { if (e.target.files[0]) _handleFile(e.target.files[0]); });
  removeBtn ?.addEventListener("click",  () => {
    if (printInput)   printInput.value           = "";
    if (imagePreview) imagePreview.style.display = "none";
    if (uploadArea)   uploadArea.style.display   = "block";
    if (previewImg)   previewImg.src             = "";
  });

  function _handleFile(file) {
    if (!file.type.startsWith("image/")) return window.showToast?.("Apenas imagens são permitidas!", "error");
    if (file.size > 5 * 1024 * 1024)    return window.showToast?.("Imagem muito grande (máx. 5MB)", "error");
    const reader = new FileReader();
    reader.onload = e => {
      if (previewImg)   previewImg.src             = e.target.result;
      if (imagePreview) imagePreview.style.display = "block";
      if (uploadArea)   uploadArea.style.display   = "none";
    };
    reader.readAsDataURL(file);
  }

  const confirmBtn  = document.getElementById("confirmSubmitBtn");
  const confirmHTML = confirmBtn?.innerHTML || "Enviar";
  confirmBtn?.addEventListener("click", async () => {
    if (!_selectedUQId) return;
    const file = printInput?.files[0];
    if (!file) return window.showToast?.("Selecione uma imagem como comprovante!", "warning");

    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

    try {
      const uid = window.RPG.getFbUser()?.uid;
      if (!uid) throw new Error("Não logado");

      // Converter imagem para base64 e salvar URL de dados no Firebase
      const base64  = await _fileToBase64(file);
      const printUrl = `data:${file.type};base64,${base64}`;

      await submitQuestProof(uid, _selectedUQId, printUrl);

      window.showToast?.("✅ Comprovante enviado! Aguardando revisão. ⏳", "success");
      closeMdl();
      await window.loadMyQuests();
      if (typeof window.loadStats === "function") await window.loadStats();

    } catch (err) {
      window.showToast?.(err.message || "Erro ao enviar comprovante", "error");
    } finally {
      if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.innerHTML = confirmHTML; }
    }
  });

  // Filtros quests disponíveis
  document.querySelectorAll("#page-quests .filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#page-quests .filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      window.loadQuests(btn.dataset.filter);
    });
  });

  // Filtros minhas quests
  document.querySelectorAll("#page-myquests .filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#page-myquests .filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      window.loadMyQuests(btn.dataset.filter);
    });
  });
});

/* ─── Utilitários ─────────────────────────────────────────────── */
function _fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function escapeHtml(text) {
  if (!text) return "";
  const d = document.createElement("div");
  d.appendChild(document.createTextNode(text));
  return d.innerHTML;
}
