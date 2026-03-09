/* ================================================================
   js/admin.js  –  Painel Admin (100% Firebase, sem backend)
   ================================================================ */

import "../firebase/session-manager.js";
import {
  getAllUsers, updateUserRole,
  getQuests, createQuest, updateQuest, toggleQuest, deleteQuest,
  getPendingSubmissions, approveSubmission, rejectSubmission,
  resetRanking, snapToArray
} from "../firebase/database.js";
import { db } from "../firebase/services-config.js";
import {
  ref, get
} from "../firebase/services-config.js";

/* ════════════════════════════════════════════════════════════════
   INICIALIZAÇÃO
════════════════════════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", async () => {
  const user = await window.RPG.waitForSession(true, true);
  if (!user) return;

  // Carregar submissões por padrão
  await loadSubmissions();

  window.loadPage = async (page) => {
    switch (page) {
      case "submissions":   await loadSubmissions();   break;
      case "quests":        await loadAdminQuests();   break;
      case "users":         await loadUsers();         break;
      case "ranking-admin": setupRankingAdmin();       break;
    }
  };

  // Bind modal print close (precisa estar no DOM)
  document.getElementById("closePrintModal")?.addEventListener("click", () => {
    document.getElementById("printModal").style.display = "none";
  });
  document.getElementById("printModal")?.addEventListener("click", e => {
    if (e.target === document.getElementById("printModal"))
      document.getElementById("printModal").style.display = "none";
  });

  // Bind criar quest
  document.getElementById("createQuestBtn")?.addEventListener("click", () => openQuestModal(null));

  // Bind fechar modais de quest
  document.getElementById("closeQuestModal") ?.addEventListener("click", _closeQuestModal);
  document.getElementById("cancelQuestModal")?.addEventListener("click", _closeQuestModal);

  // Bind salvar quest
  document.getElementById("saveQuestBtn")?.addEventListener("click", _saveQuest);
});

/* ════════════════════════════════════════════════════════════════
   SUBMISSIONS
════════════════════════════════════════════════════════════════ */
async function loadSubmissions() {
  const list = document.getElementById("submissionsList");
  if (!list) return;

  list.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Carregando...</div>';

  try {
    // Buscar submissões pendentes e usuários em paralelo
    const [subs, users] = await Promise.all([
      getPendingSubmissions(),
      getAllUsers()
    ]);

    const userMap = {};
    users.forEach(u => userMap[u.uid] = u);

    _set("submissionsCount", el => el.textContent = `${subs.length} pendente(s)`);
    _set("pendingCount",     el => el.textContent = subs.length > 0 ? subs.length : "");

    if (subs.length === 0) {
      list.innerHTML = `<div class="empty-state">
        <i class="fas fa-inbox"></i><h3>Sem revisões pendentes</h3><p>Tudo em dia! 🎉</p></div>`;
      return;
    }

    list.innerHTML = subs.map(s => {
      const u     = userMap[s.uid] || {};
      const photo = u.iconUrl
        ? null   // será tratado no HTML com emoji
        : (u.photoURL || null);
      const avatarHtml = u.iconUrl
        ? `<div class="submission-avatar-emoji">${u.iconUrl}</div>`
        : `<img src="${photo || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.nickname||u.username||"U")}&background=1a1a2e&color=c9a84c`}"
               class="submission-avatar"
               onerror="this.src='https://ui-avatars.com/api/?name=?&background=1a1a2e&color=c9a84c'"/>`;

      return `
      <div class="submission-item" id="sub-${s.id}">
        <div class="submission-user">
          ${avatarHtml}
          <div>
            <div class="submission-name">${escapeHtml(u.nickname||u.username||"Usuário")}</div>
            <div class="submission-quest-name">${escapeHtml(s.questTitle||"Quest")}</div>
          </div>
        </div>
        <div class="submission-reward">
          <i class="fas fa-coins"></i> +${s.rewardCoins||0} moedas
          ${(s.rewardXP||0)>0 ? `<span style="color:var(--purple-light);font-size:.8rem"> +${s.rewardXP} XP</span>` : ""}
        </div>
        <div class="submission-actions">
          ${s.printUrl
            ? `<button class="btn-secondary btn-view-print" data-url="${s.printUrl}"
                style="font-size:.78rem;padding:6px 12px"><i class="fas fa-image"></i> Ver Print</button>`
            : '<span style="color:var(--text-muted);font-size:.75rem">Sem print</span>'}
          <button class="btn-approve" data-id="${s.id}"><i class="fas fa-check"></i> Aprovar</button>
          <button class="btn-reject"  data-id="${s.id}"><i class="fas fa-times"></i> Rejeitar</button>
        </div>
      </div>`;
    }).join("");

    list.querySelectorAll(".btn-approve").forEach(btn =>
      btn.addEventListener("click", () => doApprove(btn.dataset.id)));
    list.querySelectorAll(".btn-reject").forEach(btn =>
      btn.addEventListener("click", () => doReject(btn.dataset.id)));
    list.querySelectorAll(".btn-view-print").forEach(btn =>
      btn.addEventListener("click", () => viewPrint(btn.dataset.url)));

  } catch (err) {
    console.error("loadSubmissions error:", err);
    list.innerHTML = `<div class="empty-state">
      <i class="fas fa-exclamation-triangle"></i>
      <h3>Erro ao carregar</h3>
      <p>${err.message || "Verifique as regras do Firebase"}</p></div>`;
  }
}

async function doApprove(id) {
  const item = document.getElementById(`sub-${id}`);
  if (item) item.style.opacity = "0.5";
  try {
    const adminUid = window.RPG.getFbUser()?.uid;
    await approveSubmission(id, adminUid);
    window.showToast?.("✅ Submissão aprovada! Moedas concedidas.", "success");
    item?.remove();
    _updatePendingCount(-1);
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
    const adminUid = window.RPG.getFbUser()?.uid;
    await rejectSubmission(id, adminUid, note);
    window.showToast?.("❌ Submissão rejeitada.", "warning");
    item?.remove();
    _updatePendingCount(-1);
  } catch (err) {
    window.showToast?.(err.message || "Erro ao rejeitar", "error");
    if (item) item.style.opacity = "1";
  }
}

function viewPrint(url) {
  const modal = document.getElementById("printModal");
  const img   = document.getElementById("printModalImg");
  if (!modal || !img) return;
  img.src = url;
  modal.style.display = "flex";
}

function _updatePendingCount(delta) {
  const badge   = document.getElementById("pendingCount");
  const countEl = document.getElementById("submissionsCount");
  if (!badge) return;
  const n = Math.max(0, (parseInt(badge.textContent) || 0) + delta);
  badge.textContent = n > 0 ? n : "";
  if (countEl) countEl.textContent = `${n} pendente(s)`;
}

/* ════════════════════════════════════════════════════════════════
   QUESTS ADMIN – mostra TODAS (ativas e inativas)
════════════════════════════════════════════════════════════════ */
async function loadAdminQuests() {
  const list = document.getElementById("adminQuestsList");
  if (!list) return;

  list.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Carregando...</div>';

  try {
    // Buscar TODAS as quests do Firebase (sem filtro de isActive)
    const snap   = await get(ref(db, "quests"));
    const quests = snapToArray(snap).sort((a, b) => (b.created_at||0) - (a.created_at||0));

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

    list.innerHTML = quests.map(q => `
      <div class="admin-quest-item ${q.isActive ? "" : "inactive"}" id="aq-${q.id}">
        <div class="admin-quest-info">
          <div class="admin-quest-title">${escapeHtml(q.title)}</div>
          <div class="admin-quest-meta">
            <span>${typeLabels[q.type] || q.type}</span>
            <span><i class="fas fa-coins"></i> ${q.rewardCoins||0} moedas</span>
            ${(q.rewardXP||0)>0 ? `<span><i class="fas fa-star"></i> ${q.rewardXP} XP</span>` : ""}
            <span><i class="fas fa-users"></i> ${q.currentUsers||0}${q.maxUsers ? `/${q.maxUsers}` : ""}</span>
            <span style="color:${q.isActive ? "var(--green)" : "var(--red)"}">
              ${q.isActive ? "● Ativa" : "● Inativa"}
            </span>
            ${q.expiresAt
              ? `<span style="color:var(--text-muted)">Expira: ${new Date(q.expiresAt).toLocaleDateString("pt-BR")}</span>`
              : ""}
          </div>
        </div>
        <div class="admin-quest-actions">
          <button class="btn-edit-quest"   data-id="${q.id}"><i class="fas fa-edit"></i> Editar</button>
          <button class="btn-toggle-quest ${q.isActive ? "deactivate" : ""}" data-id="${q.id}">
            <i class="fas fa-${q.isActive ? "pause" : "play"}"></i> ${q.isActive ? "Desativar" : "Ativar"}
          </button>
          <button class="btn-delete-quest" data-id="${q.id}"><i class="fas fa-trash"></i></button>
        </div>
      </div>`).join("");

    // Guardar quests para uso no modal de edição
    _allQuests = quests;

    list.querySelectorAll(".btn-edit-quest")  .forEach(b =>
      b.addEventListener("click", () => openQuestModal(b.dataset.id)));
    list.querySelectorAll(".btn-toggle-quest").forEach(b =>
      b.addEventListener("click", () => doToggleQuest(b.dataset.id)));
    list.querySelectorAll(".btn-delete-quest").forEach(b =>
      b.addEventListener("click", () => doDeleteQuest(b.dataset.id)));

  } catch (err) {
    console.error("loadAdminQuests error:", err);
    list.innerHTML = `<div class="empty-state">
      <i class="fas fa-exclamation-triangle"></i>
      <h3>Erro ao carregar quests</h3>
      <p>${err.message || ""}</p></div>`;
  }
}

/* ── Quest Modal ──────────────────────────────────────────────── */
let _editQuestId = null;
let _allQuests   = [];

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
      if (q.expiresAt) {
        const d = new Date(q.expiresAt);
        _set("questExpiresAt", el => el.value = d.toISOString().slice(0, 16));
      }
    }
  } else {
    if (titleEl) titleEl.innerHTML = '<i class="fas fa-plus"></i> Nova Quest';
    _set("questImageRequired", el => el.checked = true);
  }

  document.getElementById("questModal").style.display = "flex";
}

async function _saveQuest() {
  const id    = document.getElementById("questId")?.value;
  const title = document.getElementById("questTitle")?.value.trim();
  const type  = document.getElementById("questType")?.value;
  const desc  = document.getElementById("questDescription")?.value.trim();
  const coins = document.getElementById("questRewardCoins")?.value;

  if (!title || !type || !desc || !coins) {
    return window.showToast?.("Preencha todos os campos obrigatórios!", "warning");
  }

  const payload = {
    title, type, description: desc,
    rewardCoins:    coins,
    rewardXP:       document.getElementById("questRewardXP")?.value    || 0,
    maxUsers:       document.getElementById("questMaxUsers")?.value    || null,
    minLevel:       document.getElementById("questMinLevel")?.value    || 1,
    expiresAt:      document.getElementById("questExpiresAt")?.value   || null,
    eventName:      document.getElementById("questEventName")?.value?.trim() || null,
    imageRequired:  document.getElementById("questImageRequired")?.checked !== false
  };

  const saveBtn  = document.getElementById("saveQuestBtn");
  const saveHTML = saveBtn?.innerHTML;
  if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...'; }

  try {
    const adminUid = window.RPG.getFbUser()?.uid;
    if (id) {
      await updateQuest(id, payload);
      window.showToast?.("✅ Quest atualizada!", "success");
    } else {
      await createQuest(payload, adminUid);
      window.showToast?.("✅ Quest criada!", "success");
    }
    _closeQuestModal();
    await loadAdminQuests();
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
    await loadAdminQuests();
  } catch (err) {
    window.showToast?.(err.message || "Erro ao alternar status", "error");
  }
}

async function doDeleteQuest(id) {
  if (!confirm("Tem certeza que deseja deletar esta quest? Ação irreversível!")) return;
  try {
    await deleteQuest(id);
    window.showToast?.("🗑️ Quest deletada!", "success");
    document.getElementById(`aq-${id}`)?.remove();
    _allQuests = _allQuests.filter(q => q.id !== id);
  } catch (err) {
    window.showToast?.(err.message || "Erro ao deletar", "error");
  }
}

/* ════════════════════════════════════════════════════════════════
   USUÁRIOS
════════════════════════════════════════════════════════════════ */
async function loadUsers() {
  const tbody = document.getElementById("usersTableBody");
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px"><i class="fas fa-spinner fa-spin"></i></td></tr>';

  try {
    const users = await getAllUsers();
    tbody.innerHTML = users.map(u => {
      const avatarHtml = u.iconUrl
        ? `<div class="table-avatar-emoji">${u.iconUrl}</div>`
        : `<img src="${u.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.username||"U")}&background=1a1a2e&color=c9a84c&size=32`}"
               alt="" class="table-avatar"
               onerror="this.src='https://ui-avatars.com/api/?name=?&background=1a1a2e&color=c9a84c'"/>`;
      return `
      <tr>
        <td>
          <div class="table-user-cell">
            ${avatarHtml}
            <div>
              <div style="font-family:var(--font-title);font-size:.85rem">${escapeHtml(u.nickname||u.username||"?")}</div>
              <div style="font-size:.7rem;color:var(--text-muted)">${escapeHtml(u.email||"")}</div>
            </div>
          </div>
        </td>
        <td style="font-family:var(--font-title);color:var(--gold)">${u.level||1}</td>
        <td style="color:var(--gold)"><i class="fas fa-coins" style="font-size:.8rem"></i> ${(u.coins||0).toLocaleString("pt-BR")}</td>
        <td>
          <span style="padding:2px 10px;border-radius:10px;font-size:.7rem;font-weight:700;
            background:${u.role==="admin"?"rgba(168,85,247,.2)":"rgba(240,192,64,.1)"};
            color:${u.role==="admin"?"var(--purple-light)":"var(--text-secondary)"}">
            ${u.role==="admin"?"👑 Admin":"⚔️ User"}
          </span>
        </td>
        <td>
          <button class="btn-edit-quest" onclick="doToggleRole('${u.uid}','${u.role}')"
            style="font-size:.75rem;padding:5px 10px">
            <i class="fas fa-user-shield"></i>
            ${u.role==="admin"?"Remover Admin":"Tornar Admin"}
          </button>
        </td>
      </tr>`;
    }).join("");

    // Search filter
    const searchInput = document.getElementById("userSearch");
    if (searchInput && !searchInput._bound) {
      searchInput._bound = true;
      searchInput.addEventListener("input", function() {
        const q = this.value.toLowerCase();
        document.querySelectorAll("#usersTableBody tr").forEach(row => {
          row.style.display = row.textContent.toLowerCase().includes(q) ? "" : "none";
        });
      });
    }

  } catch (err) {
    console.error("loadUsers error:", err);
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--red)">Erro: ${err.message}</td></tr>`;
  }
}

window.doToggleRole = async (uid, currentRole) => {
  const newRole = currentRole === "admin" ? "user" : "admin";
  if (!confirm(`${newRole === "admin" ? "Tornar este usuário admin?" : "Remover privilégios de admin?"}`)) return;
  try {
    await updateUserRole(uid, newRole);
    window.showToast?.(`✅ Role atualizado: ${newRole}`, "success");
    await loadUsers();
  } catch (err) {
    window.showToast?.(err.message || "Erro ao atualizar role", "error");
  }
};

/* ════════════════════════════════════════════════════════════════
   RANKING ADMIN
════════════════════════════════════════════════════════════════ */
function setupRankingAdmin() {
  ["resetDaily", "resetWeekly", "resetMonthly"].forEach(btnId => {
    const btn = document.getElementById(btnId);
    if (!btn || btn._bound) return;
    btn._bound = true;
    btn.addEventListener("click", async () => {
      const period = btn.dataset.period;
      if (!confirm(`Resetar ranking ${period}? Ação irreversível!`)) return;
      const orig = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Resetando...';
      try {
        await resetRanking(period);
        window.showToast?.(`✅ Ranking ${period} resetado!`, "success");
      } catch (err) {
        window.showToast?.(err.message || "Erro ao resetar", "error");
      } finally {
        btn.disabled = false;
        btn.innerHTML = orig;
      }
    });
  });
}

/* ── Helpers ─────────────────────────────────────────────────── */
function _set(id, fn) {
  const el = document.getElementById(id);
  if (el) try { fn(el); } catch(_) {}
}

function escapeHtml(text) {
  if (!text) return "";
  const d = document.createElement("div");
  d.appendChild(document.createTextNode(text));
  return d.innerHTML;
}
