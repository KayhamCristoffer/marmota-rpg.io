/* ================================================================
   firebase/session-manager.js
   Gerencia o estado de sessão do usuário via Firebase Auth
   Expõe helpers globais usados por todas as páginas:
     - window.RPG.session  → objeto reativo com user atual
     - window.RPG.signOut  → função de logout
     - window.RPG.onReady  → callback quando sessão estiver pronta
   ================================================================ */

import { auth }                        from "./services-config.js";
import { ADMIN_UID }                   from "./firebase-config.js";
import {
  onAuthStateChanged,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail
}                                      from "./services-config.js";
import { upsertUser, getUser, getUserStats } from "./database.js";

/* ── Namespace global RPG ─────────────────────────────────────── */
window.RPG = window.RPG || {};

/* ── Base path (GitHub Pages subdir ou raiz local) ────────────── */
// Detecta automaticamente: /marmota-rpg.io/ em produção, / em local
function _basePath() {
  const p = window.location.pathname;
  // Encontrar diretório raiz: tudo antes de index.html / home.html / admin.html
  const match = p.match(/^(\/[^/]+\/)/);   // ex: /marmota-rpg.io/
  return (match && match[1] !== "/") ? match[1] : "/";
}
function _url(page) {
  return _basePath() + page;
}

/* ══════════════════════════════════════════════════════════════
   SESSION EXPIRY (30-minute auto-logout)
══════════════════════════════════════════════════════════════ */
const SESSION_KEY = "rpg_session_expiry";

function _isSessionExpired() {
  const expiry = parseInt(localStorage.getItem(SESSION_KEY) || "0");
  return expiry > 0 && Date.now() > expiry;
}

function _clearSessionExpiry() {
  localStorage.removeItem(SESSION_KEY);
}

// Periodic check every 60s — sign out if session expired
setInterval(() => {
  if (_isSessionExpired()) {
    _clearSessionExpiry();
    signOut(auth).catch(() => {});
  }
}, 60_000);

// Also check on tab focus
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && _isSessionExpired()) {
    _clearSessionExpiry();
    signOut(auth).catch(() => {});
  }
});

/* ── Estado interno da sessão ─────────────────────────────────── */
const _state = {
  fbUser:   null,   // Firebase Auth user object
  profile:  null,   // Perfil do Realtime DB
  ready:    false,  // Sessão resolvida (logado ou não)
  callbacks: []     // Funções a chamar quando pronto
};

/* ── Notificar observadores ───────────────────────────────────── */
function _notify() {
  _state.ready = true;
  _state.callbacks.forEach(fn => {
    try { fn(_state.profile); } catch(e) { console.error(e); }
  });
  _state.callbacks = [];
}

/* ── Listener principal ──────────────────────────────────────── */
onAuthStateChanged(auth, async (fbUser) => {
  if (fbUser) {
    // Check if session has expired (30-min timer)
    if (_isSessionExpired()) {
      _clearSessionExpiry();
      signOut(auth);
      _state.fbUser  = null;
      _state.profile = null;
      _notify();
      return;
    }
    _state.fbUser = fbUser;
    // Criar/buscar perfil no DB
    _state.profile = await upsertUser(fbUser.uid, {
      email:      fbUser.email,
      username:   fbUser.displayName,
      photoURL:   fbUser.photoURL
    });
    // Preencher sidebar automaticamente
    _fillSidebar(_state.profile);
  } else {
    _state.fbUser  = null;
    _state.profile = null;
  }
  _notify();
});

/* ════════════════════════════════════════════════════════════════
   API pública – window.RPG.*
════════════════════════════════════════════════════════════════ */

/**
 * Aguarda a sessão ser resolvida e retorna o perfil (ou null se deslogado).
 * Se a página exigir autenticação (requireAuth=true), redireciona para /
 * Se a página exigir admin (requireAdmin=true), redireciona para home
 */
window.RPG.waitForSession = (requireAuth = false, requireAdmin = false) => {
  return new Promise((resolve) => {
    const check = (profile) => {
      if (requireAuth && !profile) {
        window.location.href = _url("index.html");
        return resolve(null);
      }
      if (requireAdmin && (!profile || profile.role !== "admin")) {
        window.location.href = _url("home.html");
        return resolve(null);
      }
      resolve(profile);
    };

    if (_state.ready) {
      check(_state.profile);
    } else {
      _state.callbacks.push(check);
    }
  });
};

/** Retorna o perfil atual (síncrono, pode ser null antes de pronto) */
window.RPG.getProfile = () => _state.profile;

/** Retorna o Firebase Auth user atual */
window.RPG.getFbUser = () => _state.fbUser;

/** Atualiza o perfil em cache (útil após mudanças locais) */
window.RPG.refreshProfile = async () => {
  if (!_state.fbUser) return null;
  _state.profile = await getUserStats(_state.fbUser.uid);
  _fillSidebar(_state.profile);
  return _state.profile;
};

/* ── Login com Google ─────────────────────────────────────────── */
window.RPG.loginWithGoogle = async () => {
  const provider = new GoogleAuthProvider();
  const result   = await signInWithPopup(auth, provider);
  return result.user;
};

/* ── Login com E-mail/Senha ───────────────────────────────────── */
window.RPG.loginWithEmail = async (email, password) => {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
};

/* ── Cadastro com E-mail/Senha ────────────────────────────────── */
window.RPG.registerWithEmail = async (email, password, displayName) => {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) {
    await updateProfile(result.user, { displayName });
  }
  return result.user;
};

/* ── Redefinir senha ──────────────────────────────────────────── */
window.RPG.resetPassword = async (email) => {
  await sendPasswordResetEmail(auth, email);
};

/* ── Logout ───────────────────────────────────────────────────── */
window.RPG.signOut = async () => {
  _clearSessionExpiry();
  await signOut(auth);
  window.location.href = _url("index.html");
};

/* ── Tradução de erros Firebase (pt-BR) ───────────────────────── */
window.RPG.translateAuthError = (code) => {
  const map = {
    "auth/email-already-in-use":   "Este e-mail já está cadastrado.",
    "auth/invalid-email":          "E-mail inválido.",
    "auth/weak-password":          "Senha muito fraca (mínimo 6 caracteres).",
    "auth/user-not-found":         "Usuário não encontrado.",
    "auth/wrong-password":         "Senha incorreta.",
    "auth/invalid-credential":     "E-mail ou senha incorretos.",
    "auth/too-many-requests":      "Muitas tentativas. Aguarde e tente novamente.",
    "auth/popup-closed-by-user":   "Login cancelado pelo usuário.",
    "auth/network-request-failed": "Erro de conexão. Verifique sua internet.",
    "auth/requires-recent-login":  "Por segurança, faça login novamente."
  };
  return map[code] || "Ocorreu um erro. Tente novamente.";
};

/* ── Toast global ─────────────────────────────────────────────── */
window.showToast = (message, type = "info", duration = 3500) => {
  const container = document.getElementById("toastContainer");
  if (!container) return;
  const icons = {
    success: "fa-check-circle",
    error:   "fa-times-circle",
    warning: "fa-exclamation-triangle",
    info:    "fa-info-circle"
  };
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `<i class="fas ${icons[type]||icons.info}"></i><span>${message}</span>`;
  container.appendChild(el);
  setTimeout(() => el.remove(), duration + 300);
};

/* ── Spinner helper ───────────────────────────────────────────── */
window.RPG.setBtnLoading = (btn, loading, originalHTML) => {
  btn.disabled = loading;
  btn.innerHTML = loading
    ? '<i class="fas fa-spinner" style="animation:spin .8s linear infinite"></i> Aguarde...'
    : originalHTML;
};

/* ── escapeHtml global ────────────────────────────────────────── */
window.escapeHtml = (text) => {
  if (!text) return "";
  const d = document.createElement("div");
  d.appendChild(document.createTextNode(text));
  return d.innerHTML;
};

/* ════════════════════════════════════════════════════════════════
   SIDEBAR FILL
════════════════════════════════════════════════════════════════ */
function _fillSidebar(user) {
  if (!user) return;

  // Avatar: iconUrl (emoji) tem prioridade sobre photoURL
  const imgEl   = document.getElementById("sidebarAvatar");
  const emojiEl = document.getElementById("sidebarAvatarEmoji");

  if (user.iconUrl) {
    if (imgEl)   { imgEl.style.display   = "none"; }
    if (emojiEl) { emojiEl.style.display = "flex"; emojiEl.textContent = user.iconUrl; }
  } else {
    const avatar = user.photoURL ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username||"?")}&background=1a1a2e&color=c9a84c&size=80`;
    if (imgEl)   { imgEl.style.display = "block"; imgEl.src = avatar; }
    if (emojiEl) { emojiEl.style.display = "none"; }
  }

  // Truncar nome para caber no layout
  const name = user.nickname || user.username || "Aventureiro";
  _set("sidebarName",  el => el.textContent = name.length > 18 ? name.slice(0, 17) + "…" : name);
  _set("sidebarRole",  el => el.textContent = user.role === "admin" ? "Administrador" : "Aventureiro");
  _set("sidebarCoins", el => el.textContent = (user.coins || 0).toLocaleString("pt-BR"));

  // Level badge (não sobrescrever ícone de coroa em admin)
  const lvlEl = document.getElementById("sidebarLevel");
  if (lvlEl && !lvlEl.querySelector("i")) lvlEl.textContent = user.level || 1;

  // XP bar
  const xpNeeded   = (user.level || 1) * 100;
  const xpProgress = (user.xp || 0) % xpNeeded || (user.xp || 0);
  const pct        = Math.min(Math.round((xpProgress / xpNeeded) * 100), 100);
  _set("xpText", el => el.textContent = `${xpProgress} / ${xpNeeded}`);
  _set("xpFill", el => el.style.width = `${pct}%`);

  // Topbar coins
  _set("topbarCoins", el => el.textContent = (user.coins || 0).toLocaleString("pt-BR"));
}

function _set(id, fn) {
  const el = document.getElementById(id);
  if (el) try { fn(el); } catch(_) {}
}

/* ════════════════════════════════════════════════════════════════
   SIDEBAR TOGGLE + NAVEGAÇÃO (DOM ready)
════════════════════════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", () => {
  const sidebar      = document.getElementById("sidebar");
  const mainContent  = document.getElementById("mainContent");
  const toggleBtn    = document.getElementById("sidebarToggle");
  const mobileBtn    = document.getElementById("mobileMenuBtn");

  if (!sidebar) return;

  // Overlay mobile
  const overlay = document.createElement("div");
  overlay.className = "mobile-overlay";
  document.body.appendChild(overlay);

  // Desktop toggle
  toggleBtn?.addEventListener("click", () => {
    sidebar.classList.toggle("collapsed");
    mainContent?.classList.toggle("collapsed");
    localStorage.setItem("sidebarCollapsed", sidebar.classList.contains("collapsed"));
  });
  if (localStorage.getItem("sidebarCollapsed") === "true") {
    sidebar.classList.add("collapsed");
    mainContent?.classList.add("collapsed");
  }

  // Mobile
  mobileBtn?.addEventListener("click", () => {
    sidebar.classList.toggle("mobile-open");
    overlay.classList.toggle("visible");
  });
  overlay.addEventListener("click", () => {
    sidebar.classList.remove("mobile-open");
    overlay.classList.remove("visible");
  });

  // Logout links
  ["logoutBtn", "logoutLink"].forEach(id => {
    document.getElementById(id)?.addEventListener("click", e => {
      e.preventDefault();
      window.RPG.signOut();
    });
  });
  document.querySelectorAll('a[href="/auth/logout"]').forEach(a => {
    a.addEventListener("click", e => { e.preventDefault(); window.RPG.signOut(); });
  });

  // Page navigation
  const navItems    = document.querySelectorAll(".nav-item[data-page]");
  const pages       = document.querySelectorAll(".page");
  const topbarTitle = document.getElementById("topbarTitle");
  const pageTitles  = {
    stats:           "📊 Estatísticas",
    quests:          "🗡️ Pegar Quests",
    myquests:        "📜 Minhas Quests",
    ranking:         "🏆 Ranking",
    profile:         "⚙️ Perfil",
    submissions:     "📬 Revisões Pendentes",
    "quests-admin":  "🗡️ Gerenciar Quests",
    users:           "👥 Usuários",
    "ranking-admin": "🏆 Rankings"
  };

  navItems.forEach(item => {
    item.addEventListener("click", e => {
      e.preventDefault();
      const page = item.dataset.page;
      navItems.forEach(n => n.classList.remove("active"));
      item.classList.add("active");
      pages.forEach(p => p.classList.remove("active"));
      document.getElementById(`page-${page}`)?.classList.add("active");
      if (topbarTitle) topbarTitle.textContent = pageTitles[page] || page;
      sidebar.classList.remove("mobile-open");
      overlay.classList.remove("visible");
      if (window.loadPage) window.loadPage(page);
    });
  });
});

/* Keyframe spin para ícones de loading */
if (!document.getElementById("rpg-spin-style")) {
  const s = document.createElement("style");
  s.id = "rpg-spin-style";
  s.textContent = "@keyframes spin{to{transform:rotate(360deg)}}";
  document.head.appendChild(s);
}
