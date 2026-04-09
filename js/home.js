/* ================================================================
   js/home.js  –  Dashboard do usuário (100% Firebase, sem backend)
   ================================================================ */

import "../firebase/session-manager.js";
import { getUserStats, updateUserIcon } from "../firebase/database.js";

/* ─── Ícones disponíveis para escolha de perfil ─────────────── */
const AVATAR_ICONS = [
  "⚔️","🛡️","🧙","🗡️","🏹","🪄","🔮","🧝","🧟","🐉",
  "🦅","🦁","🐺","🦊","🐻","🦋","🌟","💎","👑","🏆",
  "🎯","🔥","⚡","🌈","🍄","🌙","☄️","🎭","🎲","🗺️"
];

document.addEventListener("DOMContentLoaded", async () => {
  // Aguardar sessão — redireciona para / se não logado
  const user = await window.RPG.waitForSession(true);
  if (!user) return;

  // Exibir link admin se for admin (usando JS redirect com basePath correto)
  const adminLink = document.getElementById("adminLink");
  if (adminLink && user.role === "admin") {
    adminLink.style.display = "flex";
    adminLink.addEventListener("click", e => {
      e.preventDefault();
      const p = window.location.pathname;
      const m = p.match(/^(\/[^/]+\/)/);
      const base = (m && m[1] !== "/") ? m[1] : "/";
      window.location.href = base + "admin.html";
    });
  }

  // Carregar tudo em paralelo
  await Promise.all([loadStats(), window.loadRanking?.()]);
  setupProfile(user);

  // Navegação entre páginas
  window.loadPage = async (page) => {
    switch (page) {
      case "stats":    await loadStats();                     break;
      case "quests":   await window.loadQuests?.();           break;
      case "myquests": await window.loadMyQuests?.();         break;
      case "maps":     
        await window.loadMyMaps?.("all");
        await window.loadMapExamples?.();
        break;
      case "regions":  await window.loadRegions?.("likes");   break;
      case "ranking":  await window.loadRanking?.();          break;
      case "profile":  setupProfile(window.RPG.getProfile()); break;
    }
  };
});

/* ════════════════════════════════════════════════════════════════
   ESTATÍSTICAS
════════════════════════════════════════════════════════════════ */
window.loadStats = async function loadStats() {
  try {
    const uid = window.RPG.getFbUser()?.uid;
    if (!uid) return;

    const data = await getUserStats(uid);
    if (!data) return;

    // Sidebar
    _fillAvatarEl("sidebarAvatar", data, "sidebarAvatarEmoji");
    _set("sidebarName",  el => el.textContent = _truncate(data.nickname || data.username, 18));
    _set("sidebarLevel", el => { if (!el.querySelector("i")) el.textContent = data.level; });
    _set("sidebarCoins", el => el.textContent = (data.coins||0).toLocaleString("pt-BR"));
    _set("sidebarTokens", el => el.textContent = (data.tokens||0).toLocaleString("pt-BR"));
    _set("topbarCoins",  el => el.textContent = (data.coins||0).toLocaleString("pt-BR"));
    _set("topbarTokens",  el => el.textContent = (data.tokens||0).toLocaleString("pt-BR"));

    const xpText = `${data.xpProgress} / ${data.xpForNextLevel}`;
    _set("xpText", el => el.textContent = xpText);
    _set("xpFill", el => el.style.width = `${data.xpPercent}%`);

    // Stat cards
    _set("statCoins",     el => el.textContent = (data.coins||0).toLocaleString("pt-BR"));
    _set("statXP",        el => el.textContent = (data.xp||0).toLocaleString("pt-BR"));
    _set("statLevel",     el => el.textContent = data.level||1);
    _set("statCompleted", el => el.textContent = data.quests.completed);
    _set("statActive",    el => el.textContent = data.quests.active);
    _set("statRejected",  el => el.textContent = data.quests.rejected);

    // XP bar grande
    _set("xpProgressText", el => el.textContent = xpText + " XP");
    _set("xpFillLarge",    el => el.style.width  = `${data.xpPercent}%`);
    _set("xpPercent",      el => el.textContent  = `${data.xpPercent}%`);
    _set("nextLevel",      el => el.textContent  = (data.level||1) + 1);

    // Moedas por período
    _set("coinsDaily",   el => el.textContent = (data.coinsDaily  ||0).toLocaleString("pt-BR"));
    _set("coinsWeekly",  el => el.textContent = (data.coinsWeekly ||0).toLocaleString("pt-BR"));
    _set("coinsMonthly", el => el.textContent = (data.coinsMonthly||0).toLocaleString("pt-BR"));

    // Badges / Conquistas (dinâmicas do Firebase)
    const badgesGrid = document.getElementById("badgesGrid");
    if (badgesGrid) {
      const earned = data.earnedAchievements || [];
      if (earned.length > 0) {
        badgesGrid.innerHTML = earned.map(a => `
          <div class="badge-item-full" title="${escapeHtml(a.description||'')}">
            <span class="badge-icon">${escapeHtml(a.icon || "🏆")}</span>
            <span class="badge-label">${escapeHtml(a.name)}</span>
            ${(a.questsRequired||0) > 0
              ? `<span class="badge-req">${a.questsRequired} quests</span>`
              : ""}
          </div>`).join("");
      } else {
        badgesGrid.innerHTML = "<p class='no-badges'>Complete quests para ganhar conquistas!</p>";
      }
    }

    // Badge pendingBadge
    _set("pendingBadge", el => el.textContent = data.quests.pending > 0 ? data.quests.pending : "");

    window.RPG._cachedStats = data;
    setupProfile(data);

  } catch (err) {
    console.error("loadStats error:", err);
    window.showToast?.("Erro ao carregar estatísticas", "error");
  }
};

/* ════════════════════════════════════════════════════════════════
   PERFIL
════════════════════════════════════════════════════════════════ */
function setupProfile(user) {
  if (!user) return;

  // Avatar: photoURL (Google img) ou iconUrl (emoji escolhido) ou fallback
  _fillAvatarEl("profileAvatar", user, "profileAvatarEmoji");
  _set("profileUsername",   el => el.textContent = _truncate(user.nickname || user.username, 20));
  _set("profileDiscordTag", el => el.textContent = user.email ? `📧 ${user.email}` : `@${user.username}`);
  _set("profileLevel",      el => el.textContent = `Nível ${user.level||1}`);
  _set("nicknameInput",     el => el.value = _truncate(user.nickname || user.username || "", 20));

  const roleBadge = document.getElementById("profileRoleBadge");
  if (roleBadge) {
    roleBadge.textContent = user.role === "admin" ? "👑 Administrador" : "⚔️ Aventureiro";
    if (user.role === "admin") {
      roleBadge.style.cssText = "background:rgba(168,85,247,0.2);color:#a855f7;border:1px solid rgba(168,85,247,0.3)";
    }
  }

  // Emoji picker de avatar
  _setupAvatarPicker(user);

  // Salvar nickname (bind único)
  const saveBtn = document.getElementById("saveNicknameBtn");
  const input   = document.getElementById("nicknameInput");
  if (saveBtn && !saveBtn._bound) {
    saveBtn._bound = true;
    saveBtn.addEventListener("click", async () => {
      const nick = input?.value.trim().slice(0, 20);
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
        _set("sidebarName",    el => el.textContent = _truncate(nick, 18));
        _set("profileUsername",el => el.textContent = _truncate(nick, 20));
      } catch (err) {
        window.showToast?.("Erro ao salvar nickname", "error");
      } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = orig;
      }
    });
  }
}

/* ─── Avatar Picker: emojis de ícone ───────────────────────── */
function _setupAvatarPicker(user) {
  const picker = document.getElementById("avatarPicker");
  if (!picker) return;

  // Se já foi inicializado, apenas atualizar o selected
  if (picker._bound) {
    picker.querySelectorAll(".avatar-icon-btn").forEach(b => {
      b.classList.toggle("selected", b.dataset.icon === user.iconUrl);
    });
    return;
  }
  picker._bound = true;

  picker.innerHTML = AVATAR_ICONS.map(icon => `
    <button class="avatar-icon-btn ${user.iconUrl === icon ? "selected" : ""}"
            data-icon="${icon}" title="Selecionar ${icon}">${icon}</button>
  `).join("");

  picker.querySelectorAll(".avatar-icon-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const icon = btn.dataset.icon;
      const uid  = window.RPG.getFbUser()?.uid;
      if (!uid) return;

      // Feedback visual imediato
      picker.querySelectorAll(".avatar-icon-btn").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");

      try {
        await updateUserIcon(uid, icon);

        // Atualizar avatar na sidebar e perfil
        _updateAvatarDisplay("sidebarAvatar", null, "sidebarAvatarEmoji", icon);
        _updateAvatarDisplay("profileAvatar", null, "profileAvatarEmoji", icon);
        // Atualizar cache
        if (window.RPG._cachedStats) window.RPG._cachedStats.iconUrl = icon;

        window.showToast?.(`Ícone atualizado para ${icon}!`, "success");
      } catch (err) {
        window.showToast?.("Erro ao salvar ícone", "error");
      }
    });
  });
}

/* ─── Helpers de avatar ─────────────────────────────────────── */
/**
 * Preenche um elemento de avatar:
 *  - se user.iconUrl (emoji) → mostra div-emoji, esconde img
 *  - se user.photoURL (URL)  → mostra img, esconde div-emoji
 *  - fallback: ui-avatars img
 */
function _fillAvatarEl(imgId, user, emojiId = null) {
  const imgEl   = document.getElementById(imgId);
  const emojiEl = emojiId ? document.getElementById(emojiId) : null;

  if (user.iconUrl) {
    // Emoji/ícone escolhido
    if (imgEl)   { imgEl.style.display   = "none"; }
    if (emojiEl) { emojiEl.style.display = "flex"; emojiEl.textContent = user.iconUrl; }
    else if (imgEl) {
      // fallback: usar img com letra inicial (se não tiver emojiEl)
      imgEl.style.display = "block";
      imgEl.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.iconUrl)}&background=1a1a2e&color=c9a84c&size=80`;
    }
  } else {
    const url = user.photoURL ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username||"?")}&background=1a1a2e&color=c9a84c&size=80`;
    if (imgEl)   { imgEl.style.display = "block"; imgEl.src = url; }
    if (emojiEl) { emojiEl.style.display = "none"; }
  }
}

function _updateAvatarDisplay(imgId, photoURL, emojiId, iconUrl) {
  _fillAvatarEl(imgId, { photoURL, iconUrl }, emojiId);
}

/* ─── Truncar texto ─────────────────────────────────────────── */
function _truncate(text, maxLen = 18) {
  if (!text) return "";
  return text.length > maxLen ? text.slice(0, maxLen - 1) + "…" : text;
}

/* ─── Helper _set ───────────────────────────────────────────── */
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
