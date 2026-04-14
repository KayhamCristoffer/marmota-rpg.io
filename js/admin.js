/* ================================================================
   js/admin.js  –  Painel Admin (100% Firebase, sem backend)
   ----------------------------------------------------------------
   • Usa onValue (tempo real) para TODAS as listas:
     - Revisões Pendentes (listenSubmissions)
     - Gerenciar Quests  (listenQuests)
     - Conquistas        (listenAchievements)
     - Usuários          (listenUsers)
   • Cada lista mantém listeners ativos enquanto a página está aberta.
   ================================================================ */

import "../firebase/session-manager.js";
import {
  updateUserRole,
  createQuest, updateQuest, toggleQuest, deleteQuest,
  approveSubmission, rejectSubmission,
  resetRanking, listenRanking, listenRankingHistory, getRankingHistory,
  createAchievement, updateAchievement, deleteAchievement,
  seedDefaultAchievements,
  listenSubmissions, listenQuests as _listenQuests,
  listenUsers, listenAchievements,
  getPendingMaps, getAllMaps, approveMap, rejectMap,
  listenAllMaps, listenPendingMaps,
  getMapDetails
} from "../firebase/database.js";

/* ─── Listeners ativos (para cleanup) ───────────────────────── */
let _unsubSubmissions  = null;
let _unsubAdminQuests  = null;
let _unsubUsers        = null;
let _unsubAchievements = null;

/* ════════════════════════════════════════════════════════════════
   INICIALIZAÇÃO
════════════════════════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", async () => {
  const user = await window.RPG.waitForSession(true, true);
  if (!user) return;

  /* Semente de conquistas padrão (só roda se banco estiver vazio) */
  seedDefaultAchievements().then(r => {
    if (r.seeded > 0)
      window.showToast?.(`✅ ${r.seeded} conquistas padrão criadas!`, "success");
  }).catch(() => {});

  /* Inicia todos os listeners em tempo real */
  loadSubmissions();
  loadAdminQuests();
  loadUsers();
  loadAchievements();


  /* Roteador de páginas */
  window.loadPage = async (page) => {
    switch (page) {
      case "submissions":    loadSubmissions();  break;
      case "quests":         loadAdminQuests();  break;
      case "users":          loadUsers();        break;
      case "maps":           window.loadAdminMaps("pending"); break;
      case "ranking-admin":  setupRankingAdmin(); loadRankingAdmin(); break;
      case "achievements":   loadAchievements(); break;
      case "regions-admin":  loadRegionsAdmin(); break;
    }
  };

  /* Modal print */
  document.getElementById("closePrintModal")?.addEventListener("click", () =>
    (document.getElementById("printModal").style.display = "none"));
  document.getElementById("printModal")?.addEventListener("click", e => {
    if (e.target.id === "printModal") e.target.style.display = "none";
  });

  /* Modal quest */
  document.getElementById("createQuestBtn")  ?.addEventListener("click", () => openQuestModal(null));
  document.getElementById("closeQuestModal") ?.addEventListener("click", _closeQuestModal);
  document.getElementById("cancelQuestModal")?.addEventListener("click", _closeQuestModal);
  document.getElementById("saveQuestBtn")    ?.addEventListener("click", _saveQuest);
  document.getElementById("questModal")      ?.addEventListener("click", e => {
    if (e.target.id === "questModal") _closeQuestModal();
  });

  /* Modal conquista */
  document.getElementById("createAchievementBtn")   ?.addEventListener("click", () => openAchievementModal(null));
  document.getElementById("closeAchievementModal")  ?.addEventListener("click", _closeAchievementModal);
  document.getElementById("cancelAchievementModal") ?.addEventListener("click", _closeAchievementModal);
  document.getElementById("saveAchievementBtn")     ?.addEventListener("click", _saveAchievement);
  document.getElementById("achievementModal")       ?.addEventListener("click", e => {
    if (e.target.id === "achievementModal") _closeAchievementModal();
  });

  /* Preview ícone conquista */
  document.getElementById("achIcon")?.addEventListener("input", e => {
    const prev = document.getElementById("achIconPreview");
    if (prev) prev.textContent = e.target.value || "🏆";
  });

  /* Botões de refresh (força nova assinatura) */
  document.getElementById("refreshSubmissionsBtn") ?.addEventListener("click", loadSubmissions);
  document.getElementById("refreshAdminQuestsBtn") ?.addEventListener("click", loadAdminQuests);
  document.getElementById("refreshUsersBtn")       ?.addEventListener("click", loadUsers);
  document.getElementById("refreshAchievementsBtn")?.addEventListener("click", loadAchievements);

  /* Voltar ao dashboard */
  document.getElementById("dashboardLink")?.addEventListener("click", e => {
    e.preventDefault();
    const p = window.location.pathname;
    const m = p.match(/^(\/[^/]+\/)/);
    const base = (m && m[1] !== "/") ? m[1] : "/";
    window.location.href = base + "home.html";
  });
});

/* ════════════════════════════════════════════════════════════════
   REVISÕES PENDENTES  –  tempo real via listenSubmissions
════════════════════════════════════════════════════════════════ */
function loadSubmissions() {
  const list = document.getElementById("submissionsList");
  if (!list) return;
  list.innerHTML = `<div class="loading-spinner">
    <i class="fas fa-spinner fa-spin"></i> Carregando revisões...</div>`;

  /* Cancelar listener anterior */
  if (_unsubSubmissions) { _unsubSubmissions(); _unsubSubmissions = null; }

  _unsubSubmissions = listenSubmissions(async (allSubs) => {
    /* Filtra apenas pendentes */
    const subs = allSubs.filter(s => s.status === "pending");

    /* Busca todos os usuários uma vez */
    let userMap = {};
    try {
      const { getAllUsers } = await import("../firebase/database.js");
      const users = await getAllUsers();
      users.forEach(u => { userMap[u.uid || u.id] = u; });
    } catch (_) {}

    _set("submissionsCount", el => el.textContent = `${subs.length} pendente(s)`);
    _set("pendingCount",     el => el.textContent = subs.length > 0 ? subs.length : "");

    if (subs.length === 0) {
      list.innerHTML = `<div class="empty-state">
        <i class="fas fa-inbox"></i>
        <h3>Sem revisões pendentes</h3>
        <p>Tudo em dia! 🎉</p></div>`;
      return;
    }

    list.innerHTML = subs.map(s => {
      const u = userMap[s.uid] || {};
      const avatarHtml = u.iconUrl
        ? `<div class="submission-avatar-emoji">${escapeHtml(u.iconUrl)}</div>`
        : `<img src="${u.photoURL || avatarUrl(u.nickname || u.username || "U")}"
               class="submission-avatar"
               onerror="this.src='${avatarUrl("?")}'" alt=""/>`;
      return `
      <div class="submission-item" id="sub-${s.id}">
        <div class="submission-user">
          ${avatarHtml}
          <div>
            <div class="submission-name">${escapeHtml(u.nickname || u.username || "Usuário")}</div>
            <div class="submission-quest-name">${escapeHtml(s.questTitle || "Quest")}</div>
            <div style="font-size:.7rem;color:var(--text-muted)">
              Nível ${u.level || 1} · ${(u.coins || 0).toLocaleString("pt-BR")} moedas
            </div>
          </div>
        </div>
        <div class="submission-reward">
          <i class="fas fa-coins"></i> +${s.rewardCoins || 0} moedas
          ${(s.rewardXP || 0) > 0
            ? `<span style="color:var(--purple-light);font-size:.8rem"> +${s.rewardXP} XP</span>`
            : ""}
        </div>
        <div class="submission-actions">
          ${s.printUrl
            ? _isPrintLink(s.printUrl)
              ? `<div class="print-link-view">
                   <a href="${s.printUrl}" target="_blank" rel="noopener">
                     <i class="fas fa-external-link-alt"></i> Ver Print
                   </a>
                   <button class="btn-secondary btn-view-print" data-url="${s.printUrl}"
                     style="font-size:.78rem;padding:6px 12px">
                     <i class="fas fa-eye"></i> Preview
                   </button>
                 </div>`
              : `<button class="btn-secondary btn-view-print" data-url="${s.printUrl}"
                   style="font-size:.78rem;padding:6px 12px">
                   <i class="fas fa-image"></i> Ver Print
                 </button>`
            : `<span style="color:var(--text-muted);font-size:.75rem">Sem print</span>`}
          <button class="btn-approve" data-id="${s.id}">
            <i class="fas fa-check"></i> Aprovar</button>
          <button class="btn-reject"  data-id="${s.id}">
            <i class="fas fa-times"></i> Rejeitar</button>
        </div>
      </div>`;
    }).join("");

    list.querySelectorAll(".btn-approve")   .forEach(b => b.addEventListener("click", () => doApprove(b.dataset.id)));
    list.querySelectorAll(".btn-reject")    .forEach(b => b.addEventListener("click", () => doReject(b.dataset.id)));
    list.querySelectorAll(".btn-view-print").forEach(b => b.addEventListener("click", () => viewPrint(b.dataset.url)));
  });
}

async function doApprove(id) {
  const item = document.getElementById(`sub-${id}`);
  if (item) item.style.opacity = "0.5";
  try {
    await approveSubmission(id, window.RPG.getFbUser()?.uid);
    window.showToast?.("✅ Submissão aprovada! Moedas concedidas.", "success");
    item?.remove();
  } catch (err) {
    window.showToast?.(err.message || "Erro ao aprovar", "error");
    if (item) item.style.opacity = "1";
  }
}

async function doReject(id) {
  const note = prompt("Motivo da rejeição (opcional):") || "Comprovante inválido";
  const item = document.getElementById(`sub-${id}`);
  if (item) item.style.opacity = "0.5";
  try {
    await rejectSubmission(id, window.RPG.getFbUser()?.uid, note);
    window.showToast?.("❌ Submissão rejeitada.", "warning");
    item?.remove();
  } catch (err) {
    window.showToast?.(err.message || "Erro ao rejeitar", "error");
    if (item) item.style.opacity = "1";
  }
}

function viewPrint(url) {
  if (!url) return;

  // Se for um link direto (prnt.sc, gyazo, etc.) — tenta mostrar no modal
  if (_isPrintLink(url)) {
    const modal = document.getElementById("printModal");
    const img   = document.getElementById("printModalImg");
    if (!modal || !img) { window.open(url, "_blank", "noopener"); return; }
    // Tenta carregar a imagem diretamente
    const directUrl = _getAdminDirectImageUrl(url);
    if (directUrl) {
      img.src = directUrl;
      img.onerror = () => {
        // Fallback: abre no novo tab
        modal.style.display = "none";
        window.open(url, "_blank", "noopener");
      };
    } else {
      // prnt.sc não tem CDN público direto — abre no link
      window.open(url, "_blank", "noopener");
      return;
    }
    modal.style.display = "flex";
  } else {
    // Base64 legado
    const modal = document.getElementById("printModal");
    const img   = document.getElementById("printModalImg");
    if (!modal || !img) return;
    img.src = url;
    modal.style.display = "flex";
  }
}

/** Verifica se é um link de print externo (não base64) */
function _isPrintLink(url) {
  if (!url) return false;
  return url.startsWith("http://") || url.startsWith("https://");
}

/** Tenta obter URL direta da imagem para preview no modal */
function _getAdminDirectImageUrl(url) {
  try {
    const u    = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host === "gyazo.com") {
      const id = u.pathname.replace(/^\//, "").split(".")[0];
      return `https://i.gyazo.com/${id}.png`;
    }
    if (host === "imgur.com") {
      const id = u.pathname.replace(/^\//, "").split(".")[0];
      return `https://i.imgur.com/${id}.png`;
    }
    if (host === "i.imgur.com" || host === "i.ibb.co") return url;
    return null; // prnt.sc, lightshot — sem CDN direto público
  } catch { return null; }
}

/* ════════════════════════════════════════════════════════════════
   GERENCIAR QUESTS  –  TODAS (ativas e inativas) – tempo real
════════════════════════════════════════════════════════════════ */
let _allQuests   = [];
let _editQuestId = null;

function loadAdminQuests() {
  const list = document.getElementById("adminQuestsList");
  if (!list) return;
  list.innerHTML = `<div class="loading-spinner">
    <i class="fas fa-spinner fa-spin"></i> Carregando quests...</div>`;

  /* Cancelar listener anterior */
  if (_unsubAdminQuests) { _unsubAdminQuests(); _unsubAdminQuests = null; }

  _unsubAdminQuests = _listenQuests((quests) => {
    _allQuests = quests; // inclui TODAS (ativas + inativas)

    if (quests.length === 0) {
      list.innerHTML = `<div class="empty-state">
        <i class="fas fa-scroll"></i>
        <h3>Nenhuma quest criada</h3>
        <p>Clique em "Nova Quest" para começar!</p></div>`;
      return;
    }

    const typeLabels = {
      daily:   "☀️ Diária",
      weekly:  "📅 Semanal",
      monthly: "🗓️ Mensal",
      event:   "⭐ Evento"
    };

    list.innerHTML = quests.map(q => {
      const isActive = q.isActive !== false;
      return `
      <div class="admin-quest-item ${isActive ? "" : "inactive"}" id="aq-${q.id}">
        <div class="admin-quest-info">
          <div class="admin-quest-title">${escapeHtml(q.title)}</div>
          <div class="admin-quest-meta">
            <span>${typeLabels[q.type] || q.type || "—"}</span>
            <span><i class="fas fa-coins"></i> ${q.rewardCoins || 0} moedas</span>
            ${(q.rewardXP || 0) > 0
              ? `<span><i class="fas fa-star"></i> ${q.rewardXP} XP</span>`
              : ""}
            <span><i class="fas fa-users"></i> ${q.currentUsers || 0}${q.maxUsers ? `/${q.maxUsers}` : ""}</span>
            <span style="color:${isActive ? "var(--green)" : "var(--red)"}">
              ${isActive ? "● Ativa" : "● Inativa"}
            </span>
            ${q.expiresAt
              ? `<span style="color:var(--text-muted)">
                   Expira: ${new Date(q.expiresAt).toLocaleDateString("pt-BR")}</span>`
              : ""}
          </div>
        </div>
        <div class="admin-quest-actions">
          <button class="btn-edit-quest"   data-id="${q.id}">
            <i class="fas fa-edit"></i> Editar</button>
          <button class="btn-toggle-quest ${isActive ? "deactivate" : ""}" data-id="${q.id}">
            <i class="fas fa-${isActive ? "pause" : "play"}"></i>
            ${isActive ? "Desativar" : "Ativar"}
          </button>
          <button class="btn-delete-quest" data-id="${q.id}">
            <i class="fas fa-trash"></i></button>
        </div>
      </div>`;
    }).join("");

    list.querySelectorAll(".btn-edit-quest")  .forEach(b => b.addEventListener("click", () => openQuestModal(b.dataset.id)));
    list.querySelectorAll(".btn-toggle-quest").forEach(b => b.addEventListener("click", () => doToggleQuest(b.dataset.id)));
    list.querySelectorAll(".btn-delete-quest").forEach(b => b.addEventListener("click", () => doDeleteQuest(b.dataset.id)));
  });
}

/* ── Modal quest ─────────────────────────────────────────────── */
function _closeQuestModal() {
  document.getElementById("questModal").style.display = "none";
  _editQuestId = null;
}

function openQuestModal(questId) {
  _editQuestId = questId;
  document.getElementById("questForm")?.reset();
  const titleEl = document.getElementById("questModalTitle");
  if (questId) {
    if (titleEl) titleEl.innerHTML = '<i class="fas fa-edit"></i> Editar Quest';
    const q = _allQuests.find(x => x.id === questId);
    if (q) {
      _set("questId",            el => el.value   = q.id);
      _set("questTitle",         el => el.value   = q.title);
      _set("questType",          el => el.value   = q.type);
      _set("questDescription",   el => el.value   = q.description);
      _set("questRewardCoins",   el => el.value   = q.rewardCoins);
      _set("questRewardXP",      el => el.value   = q.rewardXP || 0);
      _set("questMaxUsers",      el => el.value   = q.maxUsers || "");
      _set("questMinLevel",      el => el.value   = q.minLevel || 1);
      _set("questEventName",     el => el.value   = q.eventName || "");
      _set("questImageRequired", el => el.checked = q.imageRequired !== false);
      if (q.expiresAt)
        _set("questExpiresAt", el =>
          el.value = new Date(q.expiresAt).toISOString().slice(0, 16));
    }
  } else {
    if (titleEl) titleEl.innerHTML = '<i class="fas fa-plus"></i> Nova Quest';
    _set("questImageRequired", el => el.checked = true);
  }
  document.getElementById("questModal").style.display = "flex";
}

async function _saveQuest() {
  const id    = document.getElementById("questId")?.value;
  const title = document.getElementById("questTitle")?.value?.trim();
  const type  = document.getElementById("questType")?.value;
  const desc  = document.getElementById("questDescription")?.value?.trim();
  const coins = document.getElementById("questRewardCoins")?.value;

  if (!title || !type || !desc || !coins)
    return window.showToast?.("Preencha todos os campos obrigatórios!", "warning");

  const payload = {
    title, type, description: desc,
    rewardCoins:   coins,
    rewardXP:      document.getElementById("questRewardXP")?.value    || 0,
    maxUsers:      document.getElementById("questMaxUsers")?.value    || null,
    minLevel:      document.getElementById("questMinLevel")?.value    || 1,
    expiresAt:     document.getElementById("questExpiresAt")?.value   || null,
    eventName:     document.getElementById("questEventName")?.value?.trim() || null,
    imageRequired: document.getElementById("questImageRequired")?.checked !== false
  };

  const saveBtn  = document.getElementById("saveQuestBtn");
  const saveHTML = saveBtn?.innerHTML;
  if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...'; }
  try {
    const adminUid = window.RPG.getFbUser()?.uid;
    if (id) { await updateQuest(id, payload); window.showToast?.("✅ Quest atualizada!", "success"); }
    else    { await createQuest(payload, adminUid); window.showToast?.("✅ Quest criada!", "success"); }
    _closeQuestModal();
    // listener onValue atualiza automaticamente
  } catch (err) {
    window.showToast?.(err.message || "Erro ao salvar quest", "error");
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = saveHTML; }
  }
}

async function doToggleQuest(id) {
  try {
    const isNowActive = await toggleQuest(id);
    window.showToast?.(`Quest ${isNowActive ? "ativada ✅" : "desativada ⏸️"}!`, "info");
    // listener onValue atualiza automaticamente
  } catch (err) {
    window.showToast?.(err.message || "Erro ao alternar status", "error");
  }
}

async function doDeleteQuest(id) {
  if (!confirm("Deletar esta quest? Ação irreversível!")) return;
  try {
    await deleteQuest(id);
    window.showToast?.("🗑️ Quest deletada!", "success");
    _allQuests = _allQuests.filter(q => q.id !== id);
    // listener onValue atualiza automaticamente
  } catch (err) {
    window.showToast?.(err.message || "Erro ao deletar", "error");
  }
}

/* ════════════════════════════════════════════════════════════════
   CONQUISTAS (ACHIEVEMENTS) – tempo real via listenAchievements
════════════════════════════════════════════════════════════════ */
let _allAchievements = [];
let _editAchId       = null;

function loadAchievements() {
  const list = document.getElementById("achievementsList");
  if (!list) return;
  list.innerHTML = `<div class="loading-spinner">
    <i class="fas fa-spinner fa-spin"></i> Carregando conquistas...</div>`;

  /* Cancelar listener anterior */
  if (_unsubAchievements) { _unsubAchievements(); _unsubAchievements = null; }

  _unsubAchievements = listenAchievements((achs) => {
    _allAchievements = achs;

    /* Atualiza contador no header */
    _set("achievementsCount", el => el.textContent = `${achs.length} conquista(s)`);


    if (achs.length === 0) {
      list.innerHTML = `<div class="empty-state">
        <i class="fas fa-medal"></i>
        <h3>Nenhuma conquista criada</h3>
        <p>Clique em "Nova Conquista" para adicionar ou aguarde o carregamento automático.</p></div>`;
      return;
    }

    /* Categorias: ordem + meta */
    const catOrder  = ["quests","daily","weekly","monthly","event","level","special"];
    const catLabels = {
      quests:  { label: "⚔️ Quests Gerais",   css: "cat-quests"  },
      daily:   { label: "☀️ Diárias",          css: "cat-daily"   },
      weekly:  { label: "📅 Semanais",         css: "cat-weekly"  },
      monthly: { label: "🗓️ Mensais",          css: "cat-monthly" },
      event:   { label: "⭐ Eventos",          css: "cat-event"   },
      level:   { label: "🌟 Nível",            css: "cat-level"   },
      special: { label: "💎 Especial",         css: "cat-special" }
    };

    /* Agrupa conquistas por categoria */
    const grouped = {};
    achs.forEach(a => {
      const cat = a.category || "quests";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(a);
    });

    /* Monta HTML com headers de categoria */
    const _renderAchItem = a => {
      const catInfo = catLabels[a.category] || catLabels.quests;
      return `
      <div class="achievement-item" id="ach-${a.id}">
        <div class="achievement-icon-big">${escapeHtml(a.icon || "🏆")}</div>
        <div class="achievement-info">
          <div class="achievement-name-row">
            <span class="achievement-name">${escapeHtml(a.name)}</span>
            <span class="achievement-cat-badge ${catInfo.css}">${catInfo.label}</span>
          </div>
          <div class="achievement-desc">${escapeHtml(a.description || "")}</div>
          <div class="achievement-meta">
            ${(a.questsRequired || 0) > 0
              ? `<span><i class="fas fa-scroll"></i> ${a.questsRequired} quests</span>`
              : `<span><i class="fas fa-scroll" style="opacity:.4"></i> Nível apenas</span>`}
            <span><i class="fas fa-shield-alt"></i> Nível ${a.level || 1}+</span>
            ${(a.coinsBonus || 0) > 0 ? `<span><i class="fas fa-coins"></i> +${a.coinsBonus} moedas</span>` : ""}
            ${(a.xpBonus    || 0) > 0 ? `<span><i class="fas fa-star"></i> +${a.xpBonus} XP</span>`        : ""}
          </div>
        </div>
        <div class="achievement-actions">
          <button class="btn-edit-quest"   data-id="${a.id}"><i class="fas fa-edit"></i> Editar</button>
          <button class="btn-delete-quest" data-id="${a.id}"><i class="fas fa-trash"></i></button>
        </div>
      </div>`;
    };

    let html = "";
    catOrder.forEach(cat => {
      const items = grouped[cat];
      if (!items || items.length === 0) return;
      const meta = catLabels[cat];
      html += `<div class="ach-category-header">
        <span class="achievement-cat-badge ${meta.css}">${meta.label}</span>
        <span style="font-size:.72rem;color:var(--text-muted);margin-left:auto">${items.length} conquista(s)</span>
      </div>`;
      html += items.map(_renderAchItem).join("");
    });

    list.innerHTML = html;
    list.querySelectorAll(".btn-edit-quest")  .forEach(b => b.addEventListener("click", () => openAchievementModal(b.dataset.id)));
    list.querySelectorAll(".btn-delete-quest").forEach(b => b.addEventListener("click", () => doDeleteAchievement(b.dataset.id)));
  });
}

function _closeAchievementModal() {
  document.getElementById("achievementModal").style.display = "none";
  _editAchId = null;
}

function openAchievementModal(achId) {
  _editAchId = achId;
  document.getElementById("achForm")?.reset();
  const prev = document.getElementById("achIconPreview");
  if (prev) prev.textContent = "🏆";

  const titleEl = document.getElementById("achModalTitle");
  if (achId) {
    if (titleEl) titleEl.innerHTML = '<i class="fas fa-edit"></i> Editar Conquista';
    const a = _allAchievements.find(x => x.id === achId);
    if (a) {
      _set("achId",             el => el.value = a.id);
      _set("achName",           el => el.value = a.name || "");
      _set("achIcon",           el => el.value = a.icon || "🏆");
      _set("achDescription",    el => el.value = a.description || "");
      _set("achLevel",          el => el.value = a.level || 1);
      _set("achQuestsRequired", el => el.value = a.questsRequired || 1);
      _set("achXpBonus",        el => el.value = a.xpBonus || 0);
      _set("achCoinsBonus",     el => el.value = a.coinsBonus || 0);
      if (prev) prev.textContent = a.icon || "🏆";
      _set("achCategory", el => el.value = a.category || "quests");
    }
  } else {
    if (titleEl) titleEl.innerHTML = '<i class="fas fa-plus"></i> Nova Conquista';
    _set("achLevel",          el => el.value = 1);
    _set("achQuestsRequired", el => el.value = 0);
    _set("achXpBonus",        el => el.value = 0);
    _set("achCoinsBonus",     el => el.value = 0);
    _set("achCategory",       el => el.value = "quests");
  }
  document.getElementById("achievementModal").style.display = "flex";
}

async function _saveAchievement() {
  const id   = document.getElementById("achId")?.value;
  const name = document.getElementById("achName")?.value?.trim();
  const icon = document.getElementById("achIcon")?.value?.trim();
  if (!name) return window.showToast?.("Nome da conquista é obrigatório!", "warning");

  const payload = {
    name,
    icon:           icon || "🏆",
    description:    document.getElementById("achDescription")?.value?.trim() || "",
    category:       document.getElementById("achCategory")?.value            || "quests",
    level:          document.getElementById("achLevel")?.value               || 1,
    questsRequired: document.getElementById("achQuestsRequired")?.value      || 0,
    xpBonus:        document.getElementById("achXpBonus")?.value             || 0,
    coinsBonus:     document.getElementById("achCoinsBonus")?.value          || 0
  };

  const saveBtn  = document.getElementById("saveAchievementBtn");
  const saveHTML = saveBtn?.innerHTML;
  if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...'; }
  try {
    if (id) { await updateAchievement(id, payload); window.showToast?.("✅ Conquista atualizada!", "success"); }
    else    { await createAchievement(payload);      window.showToast?.("✅ Conquista criada!", "success"); }
    _closeAchievementModal();
    // listener onValue atualiza automaticamente
  } catch (err) {
    window.showToast?.(err.message || "Erro ao salvar conquista", "error");
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = saveHTML; }
  }
}

async function doDeleteAchievement(id) {
  if (!confirm("Deletar esta conquista? Usuários que já a possuem não serão afetados.")) return;
  try {
    await deleteAchievement(id);
    window.showToast?.("🗑️ Conquista deletada!", "success");
    _allAchievements = _allAchievements.filter(a => a.id !== id);
    // listener onValue atualiza automaticamente
  } catch (err) {
    window.showToast?.(err.message || "Erro ao deletar", "error");
  }
}

/* ════════════════════════════════════════════════════════════════
   USUÁRIOS  –  lista COMPLETA em tempo real via listenUsers
════════════════════════════════════════════════════════════════ */
function loadUsers() {
  const tbody = document.getElementById("usersTableBody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:20px">
    <i class="fas fa-spinner fa-spin"></i> Carregando usuários...</td></tr>`;

  /* Cancelar listener anterior */
  if (_unsubUsers) { _unsubUsers(); _unsubUsers = null; }

  _unsubUsers = listenUsers((users) => {
    if (users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-muted)">
        Nenhum usuário cadastrado.</td></tr>`;
      return;
    }

    tbody.innerHTML = users.map(u => {
      const uid = u.uid || u.id;
      const avatarHtml = u.iconUrl
        ? `<div class="table-avatar-emoji">${escapeHtml(u.iconUrl)}</div>`
        : `<img src="${u.photoURL || avatarUrl(u.username || "U", 32)}"
               alt="" class="table-avatar"
               onerror="this.src='${avatarUrl("?", 32)}'"/>`;
      return `
      <tr>
        <td>
          <div class="table-user-cell">
            ${avatarHtml}
            <div>
              <div style="font-family:var(--font-title);font-size:.85rem">
                ${escapeHtml(u.nickname || u.username || "?")}
              </div>
              <div style="font-size:.7rem;color:var(--text-muted)">
                ${escapeHtml(u.email || "")}
              </div>
            </div>
          </div>
        </td>
        <td style="font-family:var(--font-title);color:var(--gold)">${u.level || 1}</td>
        <td style="color:var(--gold)">
          <i class="fas fa-coins" style="font-size:.8rem"></i>
          ${(u.coins || 0).toLocaleString("pt-BR")}
        </td>
        <td>
          <span style="padding:2px 10px;border-radius:10px;font-size:.7rem;font-weight:700;
            background:${u.role === "admin" ? "rgba(168,85,247,.2)" : "rgba(240,192,64,.1)"};
            color:${u.role === "admin" ? "var(--purple-light)" : "var(--text-secondary)"}">
            ${u.role === "admin" ? "👑 Admin" : "⚔️ User"}
          </span>
        </td>
        <td>
          <button class="btn-edit-quest" onclick="doToggleRole('${uid}','${u.role || "user"}')"
            style="font-size:.75rem;padding:5px 10px">
            <i class="fas fa-user-shield"></i>
            ${u.role === "admin" ? "Remover Admin" : "Tornar Admin"}
          </button>
        </td>
      </tr>`;
    }).join("");

    /* Busca inline */
    const searchInput = document.getElementById("userSearch");
    if (searchInput && !searchInput._bound) {
      searchInput._bound = true;
      searchInput.addEventListener("input", function () {
        const q = this.value.toLowerCase();
        document.querySelectorAll("#usersTableBody tr").forEach(row => {
          row.style.display = row.textContent.toLowerCase().includes(q) ? "" : "none";
        });
      });
    }
  });
}

window.doToggleRole = async (uid, currentRole) => {
  const newRole = currentRole === "admin" ? "user" : "admin";
  if (!confirm(`${newRole === "admin" ? "Tornar este usuário admin?" : "Remover privilégios de admin?"}`)) return;
  try {
    await updateUserRole(uid, newRole);
    window.showToast?.(`✅ Role atualizado: ${newRole}`, "success");
    // listener onValue atualiza automaticamente
  } catch (err) {
    window.showToast?.(err.message || "Erro ao atualizar role", "error");
  }
};

/* ════════════════════════════════════════════════════════════════
   RANKING ADMIN  –  exibe rankings + botões de reset + histórico
════════════════════════════════════════════════════════════════ */
let _currentRankingPeriod = "total";
let _unsubRanking         = null;
let _unsubRankingHist     = null;

function _getNextResetLabel(type) {
  const now  = new Date();
  let reset;
  if (type === "daily") {
    reset = new Date(now); reset.setDate(reset.getDate() + 1); reset.setHours(0,0,0,0);
  } else if (type === "weekly") {
    reset = new Date(now);
    const dow = reset.getDay(); const days = dow === 0 ? 7 : 7 - dow;
    reset.setDate(reset.getDate() + days); reset.setHours(0,0,0,0);
  } else if (type === "monthly") {
    reset = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
  }
  if (!reset) return "";
  const diff = reset - now;
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000)  / 60000);
  if (d > 0) return `Próximo reset em ${d}d ${h}h`;
  if (h > 0) return `Próximo reset em ${h}h ${m}m`;
  return `Próximo reset em ${m}m`;
}

function setupRankingAdmin() {
  /* Preenche labels de próximo reset */
  ["daily","weekly","monthly"].forEach(p => {
    _set(`rankingNextReset_${p}`, el => el.textContent = _getNextResetLabel(p));
  });

  /* Botões de reset */
  ["resetDaily", "resetWeekly", "resetMonthly"].forEach(btnId => {
    const btn = document.getElementById(btnId);
    if (!btn || btn._bound) return;
    btn._bound = true;
    btn.addEventListener("click", async () => {
      const period = btn.dataset.period;
      if (!confirm(`Resetar ranking ${period}?\n\nO histórico atual será salvo antes do reset.\nEsta ação zerará as moedas ${period === 'daily' ? 'diárias' : period === 'weekly' ? 'semanais' : 'mensais'} de todos os jogadores.`)) return;
      const orig = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
      try {
        const result = await resetRanking(period);
        window.showToast?.(
          `✅ Ranking ${period} resetado! ${result.count} jogadores arquivados.`,
          "success"
        );
        // Recarregar ranking e histórico
        if (_currentRankingPeriod === period || _currentRankingPeriod === "total") {
          loadRankingAdmin(_currentRankingPeriod);
        }
        // Atualizar histórico se estiver visível
        loadRankingHistory(period);
      } catch (err) {
        window.showToast?.(err.message || "Erro ao resetar", "error");
      } finally {
        btn.disabled = false; btn.innerHTML = orig;
      }
    });
  });

  /* Tabs de período */
  document.querySelectorAll(".ranking-tab").forEach(tab => {
    if (tab._rankBound) return;
    tab._rankBound = true;
    tab.addEventListener("click", () => {
      document.querySelectorAll(".ranking-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      _currentRankingPeriod = tab.dataset.period;
      loadRankingAdmin(_currentRankingPeriod);
      // Carregar histórico para daily/weekly/monthly
      if (_currentRankingPeriod !== "total") {
        loadRankingHistory(_currentRankingPeriod);
      } else {
        _set("rankingHistorySection", el => el.style.display = "none");
      }
    });
  });

  /* Botão refresh */
  const refreshBtn = document.getElementById("refreshRankingBtn");
  if (refreshBtn && !refreshBtn._rankBound) {
    refreshBtn._rankBound = true;
    refreshBtn.addEventListener("click", () => {
      loadRankingAdmin(_currentRankingPeriod);
      if (_currentRankingPeriod !== "total") loadRankingHistory(_currentRankingPeriod);
    });
  }
}

function loadRankingHistory(period) {
  const section = document.getElementById("rankingHistorySection");
  if (!section) return;

  if (period === "total") { section.style.display = "none"; return; }
  section.style.display = "block";

  const container = document.getElementById("rankingHistoryList");
  const title     = document.getElementById("rankingHistoryTitle");
  if (title) title.textContent = `Histórico de Resets – ${period === 'daily' ? 'Diário' : period === 'weekly' ? 'Semanal' : 'Mensal'}`;
  if (container) container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Carregando histórico...</div>';

  if (_unsubRankingHist) { _unsubRankingHist(); _unsubRankingHist = null; }

  _unsubRankingHist = listenRankingHistory(period, (history) => {
    if (!container) return;
    if (!history || history.length === 0) {
      container.innerHTML = '<p style="color:var(--text-muted);padding:1rem;text-align:center">Nenhum histórico de reset ainda.</p>';
      return;
    }

    container.innerHTML = history.map(snapshot => {
      const date = new Date(snapshot.resetAt || 0).toLocaleString("pt-BR");
      const entries = Array.isArray(snapshot.entries) ? snapshot.entries : [];
      const top3 = entries.slice(0, 3);

      return `
        <div class="ranking-history-card">
          <div class="rh-header">
            <div class="rh-date">
              <i class="fas fa-clock"></i>
              Resetado em ${date}
            </div>
            <span class="rh-count">${entries.length} jogador(es)</span>
          </div>
          ${top3.length > 0 ? `
            <div class="rh-podium">
              ${top3.map((e, i) => `
                <div class="rh-entry">
                  <span class="rh-pos">${i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}</span>
                  <span class="rh-name">${escapeHtml(e.nickname || "Aventureiro")}</span>
                  <span class="rh-coins"><i class="fas fa-coins"></i> ${(e.coins || 0).toLocaleString("pt-BR")}</span>
                </div>
              `).join('')}
            </div>
          ` : ''}
          ${entries.length > 3 ? `
            <details class="rh-more">
              <summary>Ver todos (${entries.length})</summary>
              <div class="rh-all-entries">
                ${entries.slice(3).map((e, i) => `
                  <div class="rh-entry">
                    <span class="rh-pos">#${i + 4}</span>
                    <span class="rh-name">${escapeHtml(e.nickname || "Aventureiro")}</span>
                    <span class="rh-coins"><i class="fas fa-coins"></i> ${(e.coins || 0).toLocaleString("pt-BR")}</span>
                  </div>
                `).join('')}
              </div>
            </details>
          ` : ''}
        </div>`;
    }).join('');
  });
}

function loadRankingAdmin(period = "total") {
  _currentRankingPeriod = period;
  const tbody = document.getElementById("rankingAdminBody");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="5" class="ranking-loading">
    <i class="fas fa-spinner fa-spin"></i> Carregando ranking ${period}...</td></tr>`;

  /* Cancela listener anterior */
  if (_unsubRanking) { _unsubRanking(); _unsubRanking = null; }

  _unsubRanking = listenRanking(period, (entries) => {
    if (!entries || entries.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="ranking-loading" style="color:var(--text-muted)">
        <i class="fas fa-trophy"></i> Nenhum dado de ranking ainda.</td></tr>`;
      return;
    }

    tbody.innerHTML = entries.map((e, i) => {
      const pos    = i + 1;
      const medal  = pos === 1 ? "🥇" : pos === 2 ? "🥈" : pos === 3 ? "🥉" : `#${pos}`;
      const avatarHtml = e.iconUrl
        ? `<div class="table-avatar-emoji">${escapeHtml(e.iconUrl)}</div>`
        : `<img src="${e.photoURL || avatarUrl(e.nickname || "?", 32)}"
               alt="" class="table-avatar"
               onerror="this.src='${avatarUrl("?", 32)}'"/>`;
      const badges = Array.isArray(e.badges) && e.badges.length
        ? e.badges.slice(0, 3).map(b => `<span class="rank-badge-icon" title="${escapeHtml(b.name || "")}">${b.icon || "🏆"}</span>`).join("")
        : '<span style="color:var(--text-muted);font-size:.75rem">—</span>';

      const rowClass = pos <= 3 ? `ranking-top-${pos}` : "";
      return `
      <tr class="${rowClass}">
        <td class="rank-pos">${medal}</td>
        <td>
          <div class="table-user-cell">
            ${avatarHtml}
            <div>
              <div class="table-user-name">${escapeHtml(e.nickname || "Aventureiro")}</div>
              <div class="table-user-sub">${escapeHtml(e.username || "")}</div>
            </div>
          </div>
        </td>
        <td><span class="level-badge-sm">Nv ${e.level || 1}</span></td>
        <td class="rank-coins"><i class="fas fa-coins" style="color:var(--gold)"></i> ${(e.coins||0).toLocaleString("pt-BR")}</td>
        <td>${badges}</td>
      </tr>`;
    }).join("");
  });
}

/* ── Helpers ─────────────────────────────────────────────────── */
function avatarUrl(name, size = 40) {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=1a1a2e&color=c9a84c&size=${size}`;
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

/* ════════════════════════════════════════════════════════════════
   GERENCIAR MAPAS
════════════════════════════════════════════════════════════════ */
let _currentMapAdminFilter = "pending";
let _unsubAdminMaps        = null;

/* Helper: converter link Google Drive para thumbnail */
function _driveThumb(url) {
  if (!url) return null;
  const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w400`;
  const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2) return `https://drive.google.com/thumbnail?id=${m2[1]}&sz=w400`;
  return null;
}

function _safeScreenshotSrc(url) {
  if (!url) return null;
  if (/^https?:\/\/i\.imgur\.com/.test(url)) return url;
  if (/^https?:\/\/i\.ibb\.co/.test(url))   return url;
  const drive = _driveThumb(url);
  if (drive) return drive;
  return null; // prnt.sc, lightshot etc. — exibir como link
}

function _renderAdminScreenshot(url, index) {
  if (!url) return "";
  const src = _safeScreenshotSrc(url);
  const linkHtml = `<a href="${escapeHtml(url)}" target="_blank" rel="noopener"
      class="admin-screenshot-link" title="Abrir screenshot ${index + 1}">
      <i class="fas fa-image"></i> Screenshot ${index + 1}
    </a>`;
  if (src) {
    return `
      <div class="admin-screenshot-wrap">
        <a href="${escapeHtml(url)}" target="_blank" rel="noopener" title="Abrir original">
          <img src="${src}" alt="Screenshot ${index + 1}" class="admin-screenshot-img"
               onerror="this.parentElement.parentElement.innerHTML='${linkHtml.replace(/'/g, "&#39;")}'" />
        </a>
      </div>`;
  }
  return `<div class="admin-screenshot-wrap">${linkHtml}</div>`;
}

window.loadAdminMaps = async function(filter = "pending") {
  _currentMapAdminFilter = filter;
  const container = document.getElementById("adminMapsList");
  if (!container) return;

  // Atualizar botões de filtro
  document.querySelectorAll('[data-map-admin-filter]').forEach(b => {
    b.classList.toggle('active', b.dataset.mapAdminFilter === filter);
  });

  container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Carregando...</div>';

  if (_unsubAdminMaps) { _unsubAdminMaps(); _unsubAdminMaps = null; }

  // Usar listener em tempo real
  _unsubAdminMaps = listenAllMaps((allMaps) => {
    let maps = allMaps;
    if (filter !== "all") maps = allMaps.filter(m => m.status === filter);

    // Atualizar badge de pendentes
    const pendingCount = allMaps.filter(m => m.status === "pending").length;
    _set("pendingMapsCount", el => el.textContent = pendingCount > 0 ? pendingCount : "");

    if (maps.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-map"></i>
          <p>Nenhum mapa ${filter === 'pending' ? 'pendente' : filter === 'approved' ? 'aprovado' : filter === 'rejected' ? 'rejeitado' : ''}</p>
        </div>`;
      return;
    }

    container.innerHTML = maps.map(map => {
      const screenshots = Array.isArray(map.screenshots) ? map.screenshots : [];
      const previewSrc  = screenshots.length ? _safeScreenshotSrc(screenshots[0]) : null;
      const statusBadge = {
        pending:  '<span class="status-badge pending">⏳ Pendente</span>',
        approved: '<span class="status-badge approved">✅ Aprovado</span>',
        rejected: '<span class="status-badge rejected">❌ Rejeitado</span>'
      }[map.status] || '';

      return `
        <div class="admin-map-card" id="amap-${map.id}">
          <div class="admin-map-preview">
            ${previewSrc
              ? `<img src="${previewSrc}" alt="${escapeHtml(map.title)}" onerror="this.style.display='none'">`
              : `<div class="map-preview-placeholder"><i class="fas fa-map" style="font-size:2rem;color:var(--text-muted)"></i></div>`}
            ${statusBadge}
          </div>
          <div class="admin-map-body">
            <div class="admin-map-header">
              <div>
                <strong class="admin-map-title">${escapeHtml(map.title)}</strong>
                <div class="admin-map-meta">
                  Por <strong>${escapeHtml(map.authorName)}</strong> ·
                  ${new Date(map.created_at || 0).toLocaleDateString('pt-BR')}
                </div>
              </div>
              <div class="admin-map-stats">
                <span title="Curtidas"><i class="fas fa-heart"></i> ${map.likes || 0}</span>
                <span title="Downloads"><i class="fas fa-download"></i> ${map.downloads || 0}</span>
                <span title="Views"><i class="fas fa-eye"></i> ${map.views || 0}</span>
              </div>
            </div>

            <p class="admin-map-desc">${escapeHtml((map.description || "").substring(0, 150))}${(map.description || "").length > 150 ? '…' : ''}</p>

            ${map.topics && map.topics.length > 0 ? `
              <div class="admin-map-tags">
                ${map.topics.map(t => `<span class="topic-tag">${escapeHtml(t)}</span>`).join('')}
              </div>
            ` : ''}

            ${map.status === 'rejected' && map.rejectionReason ? `
              <div class="map-rejection" style="margin:.5rem 0">
                <i class="fas fa-exclamation-circle"></i>
                <strong>Motivo:</strong> ${escapeHtml(map.rejectionReason)}
              </div>
            ` : ''}

            ${map.status === 'approved' ? `
              <div class="admin-map-rewards">
                <span><i class="fas fa-coins"></i> +${map.coinsReward || 0} moedas</span>
                <span><i class="fas fa-gem"></i> +${map.tokensReward || 0} tokens</span>
                ${map.rewardClaimed ? '<span style="color:var(--green)"><i class="fas fa-check"></i> Recompensa entregue</span>' : ''}
              </div>
            ` : ''}

            <div class="admin-map-actions">
              <button class="btn-secondary btn-review-map" data-id="${map.id}" style="font-size:.82rem">
                <i class="fas fa-search"></i> Revisar
              </button>
              <a href="${escapeHtml(map.driveLink || '#')}" target="_blank" rel="noopener"
                 class="btn-secondary" style="font-size:.82rem">
                <i class="fas fa-external-link-alt"></i> Drive
              </a>
              ${map.status === 'pending' ? `
                <button class="btn-approve-map btn-success" data-id="${map.id}" style="font-size:.82rem">
                  <i class="fas fa-check"></i> Aprovar
                </button>
                <button class="btn-reject-map btn-danger" data-id="${map.id}" style="font-size:.82rem">
                  <i class="fas fa-times"></i> Rejeitar
                </button>
              ` : ''}
            </div>
          </div>
        </div>`;
    }).join('');

    // Event listeners
    container.querySelectorAll('.btn-review-map').forEach(btn => {
      btn.addEventListener('click', () => openMapReviewModal(btn.dataset.id));
    });
    container.querySelectorAll('.btn-approve-map').forEach(btn => {
      btn.addEventListener('click', () => handleApproveMap(btn.dataset.id));
    });
    container.querySelectorAll('.btn-reject-map').forEach(btn => {
      btn.addEventListener('click', () => handleRejectMap(btn.dataset.id));
    });
  });
};

/* ── Modal de revisão detalhada de mapa ── */
async function openMapReviewModal(mapId) {
  const modal   = document.getElementById("mapReviewModal");
  const content = document.getElementById("mapReviewContent");
  if (!modal || !content) {
    // Fallback: usar modal genérico de print
    await _openMapReviewFallback(mapId); return;
  }
  content.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Carregando...</div>';
  modal.style.display = "flex";

  try {
    // Ler direto do DB sem incrementar views (admin)
    const { get, ref } = await import("../firebase/services-config.js");
    const { db }       = await import("../firebase/services-config.js");
    const snap = await get(ref(db, `maps/${mapId}`));
    if (!snap.exists()) throw new Error("Mapa não encontrado");
    const map = snap.val();
    const screenshots = Array.isArray(map.screenshots) ? map.screenshots : [];

    content.innerHTML = `
      <div class="map-review-section">
        <div class="map-review-header">
          <h2>${escapeHtml(map.title)}</h2>
          <p>Por <strong>${escapeHtml(map.authorName)}</strong> ·
             Enviado em ${new Date(map.created_at || 0).toLocaleString('pt-BR')}</p>
          <div class="admin-map-stats" style="margin-top:.5rem">
            <span><i class="fas fa-heart"></i> ${map.likes || 0} curtidas</span>
            <span><i class="fas fa-download"></i> ${map.downloads || 0} downloads</span>
            <span><i class="fas fa-eye"></i> ${map.views || 0} views</span>
          </div>
        </div>

        <div class="map-review-section-block">
          <h3><i class="fas fa-images"></i> Screenshots (${screenshots.length})</h3>
          <div class="admin-screenshots-grid">
            ${screenshots.length > 0
              ? screenshots.map((url, i) => _renderAdminScreenshot(url, i)).join('')
              : '<p style="color:var(--text-muted)">Nenhum screenshot</p>'}
          </div>
        </div>

        <div class="map-review-section-block">
          <h3><i class="fas fa-info-circle"></i> Descrição</h3>
          <p style="white-space:pre-wrap;line-height:1.7">${escapeHtml(map.description || "")}</p>
        </div>

        ${map.topics && map.topics.length > 0 ? `
          <div class="map-review-section-block">
            <h3><i class="fas fa-tags"></i> Tags</h3>
            <div class="topics-list">
              ${map.topics.map(t => `<span class="topic-tag">${escapeHtml(t)}</span>`).join('')}
            </div>
          </div>
        ` : ''}

        <div class="map-review-section-block">
          <h3><i class="fas fa-link"></i> Link do Drive</h3>
          <a href="${escapeHtml(map.driveLink || '#')}" target="_blank" rel="noopener"
             class="btn-secondary" style="display:inline-flex;align-items:center;gap:.4rem">
            <i class="fas fa-external-link-alt"></i>
            ${escapeHtml(map.driveLink || '—')}
          </a>
        </div>

        ${map.status === 'pending' ? `
          <div class="map-review-actions" style="margin-top:1.5rem;display:flex;gap:.75rem;flex-wrap:wrap">
            <button class="btn-success" id="reviewApproveBtn" data-id="${map.id}">
              <i class="fas fa-check"></i> Aprovar Mapa
            </button>
            <button class="btn-danger" id="reviewRejectBtn" data-id="${map.id}">
              <i class="fas fa-times"></i> Rejeitar Mapa
            </button>
          </div>
        ` : `
          <div style="margin-top:1rem">
            <span class="status-badge ${map.status}">
              ${map.status === 'approved' ? '✅ Aprovado' : '❌ Rejeitado'}
            </span>
            ${map.rejectionReason ? `<p style="margin:.5rem 0;color:var(--text-muted)">Motivo: ${escapeHtml(map.rejectionReason)}</p>` : ''}
          </div>
        `}
      </div>`;

    document.getElementById("reviewApproveBtn")?.addEventListener("click", async () => {
      modal.style.display = "none";
      await handleApproveMap(mapId);
    });
    document.getElementById("reviewRejectBtn")?.addEventListener("click", async () => {
      modal.style.display = "none";
      await handleRejectMap(mapId);
    });

  } catch (err) {
    content.innerHTML = `<div class="empty-state"><p>Erro: ${escapeHtml(err.message)}</p></div>`;
  }
}

async function _openMapReviewFallback(mapId) {
  alert("Modal de revisão não encontrado. Usando fallback.");
}

async function handleApproveMap(mapId) {
  const coins = prompt("Quantas MOEDAS dar de recompensa ao autor?", "50");
  if (coins === null) return;
  const tokens = prompt("Quantos TOKENS dar de recompensa?", "10");
  if (tokens === null) return;

  const coinsNum  = Math.max(0, parseInt(coins)  || 50);
  const tokensNum = Math.max(0, parseInt(tokens) || 10);

  const btn = document.querySelector(`[data-id="${mapId}"].btn-approve-map`);
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }

  try {
    const adminUid = window.RPG?.getFbUser()?.uid;
    if (!adminUid) throw new Error("Usuário não autenticado");

    await approveMap(mapId, adminUid, { coins: coinsNum, tokens: tokensNum });
    window.showToast?.(`✅ Mapa aprovado! +${coinsNum} moedas e +${tokensNum} tokens ao autor.`, "success");
    // listener em tempo real atualiza automaticamente
  } catch (err) {
    console.error('Erro ao aprovar mapa:', err);
    window.showToast?.("Erro ao aprovar: " + (err.message || ""), "error");
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Aprovar'; }
  }
}

async function handleRejectMap(mapId) {
  const reason = prompt("Motivo da rejeição (será exibido ao autor):");
  if (reason === null) return;
  if (!reason.trim()) {
    window.showToast?.("Informe um motivo para rejeitar o mapa.", "warning");
    return;
  }

  try {
    const adminUid = window.RPG?.getFbUser()?.uid;
    if (!adminUid) throw new Error("Usuário não autenticado");
    await rejectMap(mapId, adminUid, reason.trim());
    window.showToast?.("❌ Mapa rejeitado. O autor será notificado.", "warning");
    // listener em tempo real atualiza automaticamente
  } catch (err) {
    console.error('Erro ao rejeitar mapa:', err);
    window.showToast?.("Erro ao rejeitar: " + (err.message || ""), "error");
  }
}

// Event listeners para filtros e refresh de mapas (fora do DOMContentLoaded pois são delegados)
document.addEventListener("click", (e) => {
  const filterBtn = e.target.closest('[data-map-admin-filter]');
  if (filterBtn) {
    document.querySelectorAll('[data-map-admin-filter]').forEach(b => b.classList.remove('active'));
    filterBtn.classList.add('active');
    window.loadAdminMaps(filterBtn.dataset.mapAdminFilter);
  }
});

document.getElementById("refreshAdminMapsBtn")?.addEventListener("click", () => {
  window.loadAdminMaps(_currentMapAdminFilter);
});

/* ── Fechar modal de revisão ── */
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("closeMapReviewModal")?.addEventListener("click", () => {
    document.getElementById("mapReviewModal").style.display = "none";
  });
  document.getElementById("mapReviewModal")?.addEventListener("click", e => {
    if (e.target.id === "mapReviewModal") e.target.style.display = "none";
  });
});

/* ════════════════════════════════════════════════════════════════
   REGIÕES ADMIN  –  mapas aprovados (editar/rejeitar)
════════════════════════════════════════════════════════════════ */
let _unsubRegionsAdmin = null;

function loadRegionsAdmin() {
  const container = document.getElementById("regionsAdminList");
  if (!container) return;

  container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Carregando...</div>';

  if (_unsubRegionsAdmin) { _unsubRegionsAdmin(); _unsubRegionsAdmin = null; }

  _unsubRegionsAdmin = listenAllMaps((allMaps) => {
    const approved = allMaps.filter(m => m.status === "approved");
    approved.sort((a, b) => (b.likes || 0) - (a.likes || 0));

    if (approved.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-globe-americas"></i>
          <p>Nenhum mapa aprovado ainda.</p>
        </div>`;
      return;
    }

    container.innerHTML = approved.map((map, index) => {
      const screenshots = Array.isArray(map.screenshots) ? map.screenshots : [];
      const previewSrc  = screenshots.length ? _safeScreenshotSrc(screenshots[0]) : null;

      return `
        <div class="admin-map-card" id="region-${map.id}">
          <div class="admin-map-preview" style="max-width:140px;min-width:100px">
            <div style="position:relative">
              <span class="region-rank-badge">#${index + 1}</span>
              ${previewSrc
                ? `<img src="${previewSrc}" alt="${escapeHtml(map.title)}" onerror="this.style.display='none'">`
                : `<div class="map-preview-placeholder"><i class="fas fa-map"></i></div>`}
            </div>
          </div>
          <div class="admin-map-body">
            <div class="admin-map-header">
              <div>
                <strong class="admin-map-title">${escapeHtml(map.title)}</strong>
                <div class="admin-map-meta">Por <strong>${escapeHtml(map.authorName)}</strong></div>
              </div>
              <div class="admin-map-stats">
                <span><i class="fas fa-heart"></i> ${map.likes || 0}</span>
                <span><i class="fas fa-download"></i> ${map.downloads || 0}</span>
                <span><i class="fas fa-eye"></i> ${map.views || 0}</span>
              </div>
            </div>

            <div class="admin-map-rewards">
              <span><i class="fas fa-coins"></i> ${map.coinsReward || 0} moedas</span>
              <span><i class="fas fa-gem"></i> ${map.tokensReward || 0} tokens</span>
              ${map.rewardClaimed
                ? '<span style="color:var(--green)"><i class="fas fa-check"></i> Recompensa entregue</span>'
                : '<span style="color:var(--gold)"><i class="fas fa-clock"></i> Recompensa pendente</span>'}
            </div>

            <div class="admin-map-actions" style="margin-top:.75rem">
              <button class="btn-secondary btn-review-map" data-id="${map.id}" style="font-size:.82rem">
                <i class="fas fa-search"></i> Detalhes
              </button>
              <a href="${escapeHtml(map.driveLink || '#')}" target="_blank" rel="noopener"
                 class="btn-secondary" style="font-size:.82rem">
                <i class="fas fa-external-link-alt"></i> Drive
              </a>
              <button class="btn-reject-map btn-danger" data-id="${map.id}" style="font-size:.82rem">
                <i class="fas fa-times"></i> Remover da Região
              </button>
            </div>
          </div>
        </div>`;
    }).join('');

    // Listeners
    container.querySelectorAll('.btn-review-map').forEach(btn => {
      btn.addEventListener('click', () => openMapReviewModal(btn.dataset.id));
    });
    container.querySelectorAll('.btn-reject-map').forEach(btn => {
      btn.addEventListener('click', async () => {
        const reason = prompt("Motivo para remover esta região?");
        if (reason === null) return;
        try {
          const adminUid = window.RPG?.getFbUser()?.uid;
          await rejectMap(btn.dataset.id, adminUid, reason.trim() || "Removido pelo admin");
          window.showToast?.("❌ Mapa removido das regiões.", "warning");
        } catch (err) {
          window.showToast?.("Erro: " + (err.message || ""), "error");
        }
      });
    });
  });

  // Botão refresh
  const refreshBtn = document.getElementById("refreshRegionsAdminBtn");
  if (refreshBtn && !refreshBtn._bound) {
    refreshBtn._bound = true;
    refreshBtn.addEventListener("click", loadRegionsAdmin);
  }
}
