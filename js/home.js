/* ================================================================
   js/home.js  –  Dashboard do usuário (100% Firebase, sem backend)
   ================================================================ */

import "../firebase/session-manager.js";
import { getUserStats, getQuests, getUserQuests }
  from "../firebase/database.js";

document.addEventListener("DOMContentLoaded", async () => {
  // Aguardar sessão — redireciona para / se não logado
  const user = await window.RPG.waitForSession(true);
  if (!user) return;

  // Exibir link admin se for admin
  const adminLink = document.getElementById("adminLink");
  if (adminLink && user.role === "admin") adminLink.style.display = "flex";

  // Carregar tudo
  await Promise.all([loadStats(), loadQuests(), loadMyQuests(), loadRanking()]);
  setupProfile(user);

  // Navegação entre páginas
  window.loadPage = async (page) => {
    switch (page) {
      case "stats":    await loadStats();                  break;
      case "quests":   await loadQuests();                 break;
      case "myquests": await loadMyQuests();               break;
      case "ranking":  await window.loadRanking?.();       break;
      case "profile":  setupProfile(window.RPG.getProfile()); break;
    }
  };
});

/* ════════════════════════════════════════════════════════════════
   ESTATÍSTICAS
════════════════════════════════════════════════════════════════ */
async function loadStats() {
  try {
    const uid  = window.RPG.getFbUser()?.uid;
    if (!uid) return;

    const data = await getUserStats(uid);
    if (!data) return;

    // Atualizar sidebar
    const avatar = data.photoURL ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(data.username||"?")}&background=1a1a2e&color=c9a84c`;

    _set("sidebarAvatar",  el => el.src = avatar);
    _set("sidebarName",    el => el.textContent = data.nickname || data.username);
    _set("sidebarLevel",   el => { if (!el.querySelector("i")) el.textContent = data.level; });
    _set("sidebarCoins",   el => el.textContent = (data.coins||0).toLocaleString("pt-BR"));
    _set("topbarCoins",    el => el.textContent = (data.coins||0).toLocaleString("pt-BR"));

    const xpText = `${data.xpProgress} / ${data.xpForNextLevel}`;
    _set("xpText",  el => el.textContent = xpText);
    _set("xpFill",  el => el.style.width = `${data.xpPercent}%`);

    // Stat cards
    _set("statCoins",     el => el.textContent = (data.coins||0).toLocaleString("pt-BR"));
    _set("statXP",        el => el.textContent = (data.xp||0).toLocaleString("pt-BR"));
    _set("statLevel",     el => el.textContent = data.level||1);
    _set("statCompleted", el => el.textContent = data.quests.completed);
    _set("statActive",    el => el.textContent = data.quests.active);
    _set("statRejected",  el => el.textContent = data.quests.rejected);

    // XP progress bar grande
    _set("xpProgressText", el => el.textContent = xpText + " XP");
    _set("xpFillLarge",    el => el.style.width  = `${data.xpPercent}%`);
    _set("xpPercent",      el => el.textContent  = `${data.xpPercent}%`);
    _set("nextLevel",      el => el.textContent  = (data.level||1) + 1);

    // Moedas por período
    _set("coinsDaily",   el => el.textContent = (data.coinsDaily  ||0).toLocaleString("pt-BR"));
    _set("coinsWeekly",  el => el.textContent = (data.coinsWeekly ||0).toLocaleString("pt-BR"));
    _set("coinsMonthly", el => el.textContent = (data.coinsMonthly||0).toLocaleString("pt-BR"));

    // Badges
    const badgesGrid  = document.getElementById("badgesGrid");
    const badgeLabels = {
      first_quest: { label: "⚡ Primeira Quest",      css: "badge-first_quest" },
      bronze:      { label: "🥉 Bronze (10 quests)",  css: "badge-bronze" },
      silver:      { label: "🥈 Prata (50 quests)",   css: "badge-silver" },
      gold:        { label: "🥇 Ouro (100 quests)",   css: "badge-gold" },
      diamond:     { label: "💎 Diamante (250 quests)",css: "badge-diamond" }
    };

    if (badgesGrid) {
      if (data.badges && data.badges.length > 0) {
        badgesGrid.innerHTML = data.badges.map(b => {
          const info = badgeLabels[b] || { label: b, css: "" };
          return `<span class="badge-item ${info.css}">${info.label}</span>`;
        }).join("");
      } else {
        badgesGrid.innerHTML = "<p class='no-badges'>Complete quests para ganhar conquistas!</p>";
      }
    }

    // Badge de quests pendentes
    if (data.quests.pending > 0) {
      _set("pendingBadge", el => el.textContent = data.quests.pending);
    }

    // Atualizar cache global
    window.RPG._cachedStats = data;
    setupProfile(data);

  } catch (err) {
    console.error("loadStats error:", err);
    window.showToast?.("Erro ao carregar estatísticas", "error");
  }
}

/* ════════════════════════════════════════════════════════════════
   PERFIL
════════════════════════════════════════════════════════════════ */
function setupProfile(user) {
  if (!user) return;

  const avatar = user.photoURL ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username||"?")}&background=1a1a2e&color=c9a84c&size=128`;

  _set("profileAvatar",    el => el.src = avatar);
  _set("profileUsername",  el => el.textContent = user.nickname || user.username);
  _set("profileDiscordTag",el => el.textContent = user.email ? `📧 ${user.email}` : `@${user.username}`);
  _set("profileLevel",     el => el.textContent = `Nível ${user.level||1}`);
  _set("nicknameInput",    el => el.value = user.nickname || user.username || "");

  const roleBadge = document.getElementById("profileRoleBadge");
  if (roleBadge) {
    roleBadge.textContent = user.role === "admin" ? "👑 Administrador" : "⚔️ Aventureiro";
    if (user.role === "admin") {
      roleBadge.style.background = "rgba(168,85,247,0.2)";
      roleBadge.style.color      = "#a855f7";
      roleBadge.style.border     = "1px solid rgba(168,85,247,0.3)";
    }
  }

  // Salvar nickname
  const saveBtn = document.getElementById("saveNicknameBtn");
  const input   = document.getElementById("nicknameInput");
  if (saveBtn && !saveBtn._bound) {
    saveBtn._bound = true;
    saveBtn.addEventListener("click", async () => {
      const nick = input?.value.trim();
      if (!nick || nick.length < 2)
        return window.showToast?.("Nickname deve ter pelo menos 2 caracteres", "warning");

      const orig = saveBtn.innerHTML;
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<i class="fas fa-spinner" style="animation:spin .8s linear infinite"></i> Salvando...';

      try {
        const uid = window.RPG.getFbUser()?.uid;
        if (!uid) throw new Error("Não logado");
        const { updateNickname } = await import("../firebase/database.js");
        await updateNickname(uid, nick);
        window.showToast?.("Nickname atualizado! 🎉", "success");
        _set("sidebarName",    el => el.textContent = nick);
        _set("profileUsername",el => el.textContent = nick);
      } catch (err) {
        window.showToast?.("Erro ao salvar nickname", "error");
      } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = orig;
      }
    });
  }
}

/* ════════════════════════════════════════════════════════════════
   QUESTS (disponíveis)
════════════════════════════════════════════════════════════════ */
window.loadQuests = async function loadQuestsPage(filter = "all") {
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
      return { ...q, userStatus: uq?.status || null, isAvailable: !q.maxUsers || q.currentUsers < q.maxUsers };
    });

    grid.innerHTML = questsWithStatus.map(q => renderQuestCard(q)).join("");

    // Bind botões de pegar quest
    grid.querySelectorAll('.btn-take-quest[data-action="take"]').forEach(btn => {
      btn.addEventListener("click", () => doTakeQuest(btn.dataset.id));
    });

    // Badge de disponíveis
    const available = questsWithStatus.filter(q => !q.userStatus && q.isAvailable).length;
    _set("availableBadge", el => el.textContent = available > 0 ? available : "");

  } catch (err) {
    console.error("loadQuests error:", err);
    grid.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Erro ao carregar</h3></div>';
  }
};

// Alias global para compatibilidade
async function loadQuests(f) { return window.loadQuests(f); }

function renderQuestCard(q) {
  const typeLabels = {
    daily:   { label: "☀️ Diária",  css: "type-daily"   },
    weekly:  { label: "📅 Semanal", css: "type-weekly"  },
    monthly: { label: "🗓️ Mensal",  css: "type-monthly" },
    event:   { label: "⭐ Evento",  css: "type-event"   }
  };
  const typeInfo = typeLabels[q.type] || { label: q.type, css: "" };

  let btnHtml = "";
  if (q.userStatus === "active")          btnHtml = `<button class="btn-take-quest taken" disabled>📜 Em progresso</button>`;
  else if (q.userStatus === "pending_review") btnHtml = `<button class="btn-take-quest pending" disabled>⏳ Em análise</button>`;
  else if (q.userStatus === "completed")  btnHtml = `<button class="btn-take-quest completed" disabled>✅ Concluída</button>`;
  else if (q.userStatus === "rejected")   btnHtml = `<button class="btn-take-quest taken" disabled>❌ Rejeitada</button>`;
  else if (!q.isAvailable)                btnHtml = `<button class="btn-take-quest taken" disabled>🔒 Esgotada</button>`;
  else                                    btnHtml = `<button class="btn-take-quest" data-action="take" data-id="${q.id}">⚔️ Pegar Quest</button>`;

  return `
    <div class="quest-card" data-type="${q.type}" data-id="${q.id}">
      <div class="quest-type-badge ${typeInfo.css}">${typeInfo.label}</div>
      <h3 class="quest-title">${escapeHtml(q.title)}</h3>
      <p class="quest-description">${escapeHtml(q.description)}</p>
      <div class="quest-meta">
        <span class="quest-reward">
          <i class="fas fa-coins"></i> +${q.rewardCoins} moedas
          ${q.rewardXP > 0 ? `<span class="xp-reward">+${q.rewardXP} XP</span>` : ""}
        </span>
        ${q.maxUsers ? `<span class="quest-slots"><i class="fas fa-users"></i> ${q.currentUsers}/${q.maxUsers}</span>` : ""}
        ${q.minLevel > 1 ? `<span style="font-size:.75rem;color:var(--text-muted)"><i class="fas fa-lock"></i> Nível ${q.minLevel}+</span>` : ""}
        ${q.expiresAt ? `<span class="quest-expires"><i class="fas fa-clock"></i> Expira: ${new Date(q.expiresAt).toLocaleDateString("pt-BR")}</span>` : ""}
      </div>
      ${btnHtml}
    </div>`;
}

async function doTakeQuest(questId) {
  const btn = document.querySelector(`.btn-take-quest[data-id="${questId}"]`);
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }

  try {
    const uid = window.RPG.getFbUser()?.uid;
    if (!uid) throw new Error("Não logado");
    const { takeQuest } = await import("../firebase/database.js");
    await takeQuest(uid, questId);
    window.showToast?.("🗡️ Quest aceita! Complete a missão!", "success");
    await loadQuests();
    await loadMyQuests();
  } catch (err) {
    window.showToast?.(err.message || "Erro ao pegar quest", "error");
    if (btn) { btn.disabled = false; btn.innerHTML = "⚔️ Pegar Quest"; }
  }
}

/* ════════════════════════════════════════════════════════════════
   MINHAS QUESTS
════════════════════════════════════════════════════════════════ */
window.loadMyQuests = async function loadMyQuestsPage(filter = "all") {
  const list = document.getElementById("myQuestsList");
  if (!list) return;

  list.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Carregando...</div>';

  try {
    const uid = window.RPG.getFbUser()?.uid;
    if (!uid) return;
    let myQuests = await getUserQuests(uid);
    if (filter !== "all") myQuests = myQuests.filter(q => q.status === filter);

    if (myQuests.length === 0) {
      list.innerHTML = `<div class="empty-state"><i class="fas fa-scroll"></i>
        <h3>Nenhuma quest aqui</h3>
        <p>Vá em "Pegar Quests" para começar!</p></div>`;
      return;
    }

    list.innerHTML = myQuests.map(uq => renderMyQuestItem(uq)).join("");

    list.querySelectorAll(".btn-submit-quest").forEach(btn => {
      btn.addEventListener("click", () => openSubmitModal(btn.dataset.id, btn.dataset.title));
    });

  } catch (err) {
    console.error("loadMyQuests error:", err);
    list.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Erro</h3></div>';
  }
};

async function loadMyQuests(f) { return window.loadMyQuests(f); }

function renderMyQuestItem(uq) {
  const statusLabels = {
    active:         { label: "Ativa",       css: "status-active" },
    pending_review: { label: "Em Análise",  css: "status-pending_review" },
    completed:      { label: "Concluída",   css: "status-completed" },
    rejected:       { label: "Rejeitada",   css: "status-rejected" },
    failed:         { label: "Falhou",      css: "status-failed" }
  };
  const typeColors = { daily: "var(--orange)", weekly: "var(--blue)", monthly: "var(--purple-light)", event: "var(--gold)" };
  const s = statusLabels[uq.status] || { label: uq.status, css: "" };

  let btn = "";
  if (uq.status === "active") {
    btn = `<button class="btn-submit-quest" data-id="${uq.id}" data-title="${escapeHtml(uq.questTitle||"")}">
      <i class="fas fa-upload"></i> Enviar Print</button>`;
  } else if (uq.status === "pending_review") {
    btn = `<button class="btn-submit-quest" style="background:rgba(249,115,22,.15);color:var(--orange)" disabled>
      <i class="fas fa-clock"></i> Aguardando</button>`;
  } else if (uq.status === "completed") {
    btn = `<button class="btn-submit-quest" style="background:rgba(34,197,94,.15);color:var(--green)" disabled>
      <i class="fas fa-check"></i> +${uq.rewardCoins} moedas</button>`;
  } else if (uq.status === "rejected") {
    btn = `<button class="btn-submit-quest" style="background:rgba(239,68,68,.15);color:var(--red)" disabled>
      <i class="fas fa-times"></i> Rejeitada</button>`;
  }

  return `
    <div class="my-quest-item">
      <div class="my-quest-icon" style="color:${typeColors[uq.questType]||"var(--gold)"}">
        <i class="fas fa-scroll"></i>
      </div>
      <div class="my-quest-info">
        <div class="my-quest-title">${escapeHtml(uq.questTitle||"Quest")}</div>
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

/* ════════════════════════════════════════════════════════════════
   MODAL DE ENVIO DE PRINT (upload para GitHub via API)
════════════════════════════════════════════════════════════════ */
let _selectedUQId = null;

function openSubmitModal(userQuestId, questTitle) {
  _selectedUQId = userQuestId;
  _set("submitQuestTitle", el => el.textContent = `Quest: ${questTitle}`);
  const modal = document.getElementById("submitModal");
  if (modal) modal.style.display = "flex";
  _set("imagePreview", el => el.style.display = "none");
  _set("uploadArea",   el => el.style.display = "block");
  const inp = document.getElementById("printInput");
  if (inp) inp.value = "";
}

document.addEventListener("DOMContentLoaded", () => {
  const submitModal   = document.getElementById("submitModal");
  if (!submitModal) return;

  const closeMdl = () => { submitModal.style.display = "none"; _selectedUQId = null; };

  document.getElementById("closeSubmitModal") ?.addEventListener("click", closeMdl);
  document.getElementById("cancelSubmitBtn")  ?.addEventListener("click", closeMdl);
  submitModal.addEventListener("click", e => { if (e.target === submitModal) closeMdl(); });

  const uploadArea  = document.getElementById("uploadArea");
  const printInput  = document.getElementById("printInput");
  const imagePreview= document.getElementById("imagePreview");
  const previewImg  = document.getElementById("previewImg");
  const removeBtn   = document.getElementById("removeImgBtn");

  uploadArea?.addEventListener("click",    () => printInput?.click());
  uploadArea?.addEventListener("dragover", e => { e.preventDefault(); uploadArea.classList.add("drag-over"); });
  uploadArea?.addEventListener("dragleave",() => uploadArea.classList.remove("drag-over"));
  uploadArea?.addEventListener("drop",     e => {
    e.preventDefault(); uploadArea.classList.remove("drag-over");
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });
  printInput?.addEventListener("change",   e => { if (e.target.files[0]) handleFile(e.target.files[0]); });
  removeBtn ?.addEventListener("click",    () => {
    if (printInput) printInput.value = "";
    if (imagePreview) imagePreview.style.display = "none";
    if (uploadArea)   uploadArea.style.display   = "block";
    if (previewImg)   previewImg.src             = "";
  });

  function handleFile(file) {
    if (!file.type.startsWith("image/")) return window.showToast?.("Apenas imagens são permitidas!", "error");
    if (file.size > 5 * 1024 * 1024)    return window.showToast?.("Imagem muito grande (máx. 5MB)", "error");
    const reader = new FileReader();
    reader.onload = e => {
      if (previewImg)   previewImg.src = e.target.result;
      if (imagePreview) imagePreview.style.display = "block";
      if (uploadArea)   uploadArea.style.display   = "none";
    };
    reader.readAsDataURL(file);
  }

  const confirmBtn  = document.getElementById("confirmSubmitBtn");
  const confirmHTML = confirmBtn?.innerHTML;
  confirmBtn?.addEventListener("click", async () => {
    if (!_selectedUQId) return;
    const file = printInput?.files[0];
    if (!file) return window.showToast?.("Selecione uma imagem!", "warning");

    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

    try {
      const uid = window.RPG.getFbUser()?.uid;
      if (!uid) throw new Error("Não logado");

      // Converter imagem para base64 e fazer upload para o GitHub
      const base64 = await fileToBase64(file);
      const ext    = file.name.split(".").pop() || "png";
      const path   = `users/${uid}/${_selectedUQId}.${ext}`;

      // Upload para GitHub via API pública (requer token configurado)
      // Por ser GitHub Pages, usamos a imagem em base64 direto no Realtime DB
      // (para imagens pequenas) ou URL de data (preview local)
      const printUrl = await uploadImageToGitHub(base64, path, file.type);

      const { submitQuestProof } = await import("../firebase/database.js");
      await submitQuestProof(uid, _selectedUQId, printUrl);

      window.showToast?.("✅ Comprovante enviado! Aguardando revisão. ⏳", "success");
      closeMdl();
      await loadMyQuests();
      await loadStats();

    } catch (err) {
      window.showToast?.(err.message || "Erro ao enviar comprovante", "error");
    } finally {
      if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.innerHTML = confirmHTML; }
    }
  });

  // Filtros
  document.querySelectorAll("#page-quests .filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#page-quests .filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      loadQuests(btn.dataset.filter);
    });
  });
  document.querySelectorAll("#page-myquests .filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#page-myquests .filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      loadMyQuests(btn.dataset.filter);
    });
  });
});

/* ── Upload de imagem para GitHub via API ─────────────────────── */
async function uploadImageToGitHub(base64, path, mimeType) {
  // Configurações do GitHub — ajuste nas variáveis abaixo
  const GITHUB_TOKEN  = ""; // ← Coloque seu GitHub PAT aqui (Fine-grained, Contents R+W)
  const GITHUB_OWNER  = "KayhamCristoffer";
  const GITHUB_REPO   = "marmota-rpg.io";
  const GITHUB_BRANCH = "main";

  if (!GITHUB_TOKEN) {
    // Sem token: salvar URL de dados diretamente (funciona sem GitHub)
    return `data:${mimeType};base64,${base64}`;
  }

  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: `Upload proof: ${path}`,
      content: base64,
      branch:  GITHUB_BRANCH
    })
  });

  if (!res.ok) {
    const err = await res.json();
    // Se o arquivo já existe, atualizar
    if (err.message?.includes("already exists")) {
      const existRes = await fetch(url, { headers: { Authorization: `token ${GITHUB_TOKEN}` } });
      const existData = await existRes.json();
      const updateRes = await fetch(url, {
        method: "PUT",
        headers: { Authorization: `token ${GITHUB_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Update proof: ${path}`,
          content: base64,
          sha:     existData.sha,
          branch:  GITHUB_BRANCH
        })
      });
      const updateData = await updateRes.json();
      return updateData.content.download_url;
    }
    throw new Error("Erro no upload para GitHub: " + err.message);
  }

  const data = await res.json();
  return data.content.download_url;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ── helper _set ─────────────────────────────────────────────── */
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
