/* ================================================================
   js/ranking.js  –  Ranking (100% Firebase, sem backend)
   ----------------------------------------------------------------
   • Usa listenRanking (onValue) para atualização em tempo real.
   • Carrega TODOS os usuários sem limite fixo.
   • Mostra posição do usuário logado mesmo fora do top.
   ================================================================ */

import "../firebase/session-manager.js";
import { listenRanking } from "../firebase/database.js";

/* ─── Listener ativo ────────────────────────────────────────── */
let _unsubRanking   = null;
let _currentPeriod  = "total";
let _currentCurrency = "coins"; // 'coins' ou 'tokens'

/* ════════════════════════════════════════════════════════════════
   Carregar ranking – tempo real
════════════════════════════════════════════════════════════════ */
window.loadRanking = function loadRankingPage(period = "total") {
  _currentPeriod = period;
  const podium = document.getElementById("rankingPodium");
  const list   = document.getElementById("rankingList");
  if (!list) return;

  list.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Carregando ranking...</div>';
  if (podium) podium.innerHTML = "";

  /* Cancelar listener anterior */
  if (_unsubRanking) { _unsubRanking(); _unsubRanking = null; }

  _unsubRanking = listenRanking(period, (ranking) => {
    const uid = window.RPG?.getFbUser()?.uid;

    if (!ranking || ranking.length === 0) {
      if (podium) podium.innerHTML = "";
      list.innerHTML = `<div class="empty-state">
        <i class="fas fa-trophy"></i><h3>Ranking vazio</h3>
        <p>Seja o primeiro a completar uma quest!</p></div>`;
      return;
    }

    // Ordenar por moeda selecionada (coins ou tokens)
    const sortedRanking = [...ranking].sort((a, b) => {
      const valA = _currentCurrency === 'tokens' ? (a.tokens || 0) : (a.coins || 0);
      const valB = _currentCurrency === 'tokens' ? (b.tokens || 0) : (b.coins || 0);
      return valB - valA;
    }).map((r, i) => ({ ...r, position: i + 1 }));

    /* Pódio top 3 */
    if (podium) {
      const top3  = sortedRanking.slice(0, 3);
      const order = [1, 0, 2]; // visual: 2º, 1º, 3º
      podium.innerHTML = order
        .filter(i => top3[i])
        .map(i => renderPodiumItem(top3[i], uid))
        .join("");
    }

    /* Lista completa – TODOS os itens */
    const posIcons = { 1:"🥇", 2:"🥈", 3:"🥉" };

    /* Badges dinâmicos: mapear IDs de conquistas para ícones */
    list.innerHTML = sortedRanking.map(r => {
      const isMe  = r.uid === uid;
      const avatarHtml = r.iconUrl
        ? `<div class="ranking-avatar-emoji">${escapeHtml(r.iconUrl)}</div>`
        : `<img src="${r.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(r.nickname||r.username||"?")}&background=1a1a2e&color=c9a84c`}"
               alt="${escapeHtml(r.nickname||r.username)}"
               class="ranking-avatar"
               onerror="this.src='https://ui-avatars.com/api/?name=?&background=1a1a2e&color=c9a84c'"/>`;

      const badgesHtml = Array.isArray(r.badges) && r.badges.length > 0
        ? r.badges.slice(0, 3).map(b =>
            `<span class="rank-badge" title="Conquista">${typeof b === "string" && b.length <= 3 ? b : "🏆"}</span>`
          ).join("")
        : "";

      return `
      <div class="ranking-item ${isMe ? "is-me" : ""}">
        <span class="rank-position rank-pos-${r.position}">
          ${r.position <= 3 ? posIcons[r.position] : `#${r.position}`}
        </span>
        ${avatarHtml}
        <span class="ranking-name">
          ${escapeHtml(r.nickname || r.username || "Aventureiro")}
          ${isMe ? '<span style="color:var(--gold);font-size:.7rem;margin-left:4px">(você)</span>' : ""}
          ${badgesHtml}
        </span>
        <span class="ranking-level">Nv.${r.level||1}</span>
        <span class="ranking-coins">
          ${_currentCurrency === 'tokens' 
            ? `<i class="fas fa-gem" style="font-size:.8rem;color:#c084fc"></i> ${(r.tokens||0).toLocaleString("pt-BR")}`
            : `<i class="fas fa-coins" style="font-size:.8rem"></i> ${(r.coins||0).toLocaleString("pt-BR")}`
          }
        </span>
      </div>`;
    }).join("");

    /* Minha posição se não aparecer na lista visível */
    if (uid) {
      const myEntry = ranking.find(r => r.uid === uid);
      if (!myEntry) {
        const note = document.createElement("div");
        note.style.cssText = "text-align:center;padding:12px;color:var(--text-secondary);font-size:.8rem;border-top:1px solid var(--border);margin-top:8px;";
        note.textContent = "Você ainda não está no ranking. Complete quests para aparecer!";
        list.appendChild(note);
      }
    }
  });
};

/* ── Pódio ───────────────────────────────────────────────────── */
function renderPodiumItem(user, currentUid) {
  const labels = { 1:"🥇", 2:"🥈", 3:"🥉" };
  const isMe   = user.uid === currentUid;
  const avatarHtml = user.iconUrl
    ? `<div class="podium-avatar-emoji">${escapeHtml(user.iconUrl)}</div>`
    : `<img src="${user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.nickname||"?")}&background=1a1a2e&color=c9a84c`}"
           alt="${escapeHtml(user.nickname||user.username)}"
           class="podium-avatar"
           onerror="this.src='https://ui-avatars.com/api/?name=?&background=1a1a2e&color=c9a84c'"/>`;

  return `
    <div class="podium-item pos-${user.position} ${isMe ? "is-me" : ""}">
      ${avatarHtml}
      <span class="podium-name" title="${escapeHtml(user.nickname||user.username)}">
        ${escapeHtml(user.nickname || user.username || "?")}
      </span>
      <span class="podium-coins">
        ${_currentCurrency === 'tokens'
          ? `<i class="fas fa-gem" style="font-size:.7rem;color:#c084fc"></i> ${(user.tokens||0).toLocaleString("pt-BR")}`
          : `<i class="fas fa-coins" style="font-size:.7rem"></i> ${(user.coins||0).toLocaleString("pt-BR")}`
        }
      </span>
      <div class="podium-stand">${labels[user.position] || user.position}</div>
    </div>`;
}

/* ── Filtros de período ──────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {
  const rankingPage = document.getElementById("page-ranking");
  if (!rankingPage) return;

  rankingPage.querySelectorAll(".filter-btn[data-period]").forEach(btn => {
    btn.addEventListener("click", () => {
      rankingPage.querySelectorAll(".filter-btn[data-period]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      window.loadRanking(btn.dataset.period);
    });
  });

  /* Toggle de moeda (Coins/Tokens) */
  rankingPage.querySelectorAll(".currency-toggle-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      rankingPage.querySelectorAll(".currency-toggle-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      _currentCurrency = btn.dataset.currency;
      window.loadRanking(_currentPeriod);
    });
  });

  /* Refresh força re-assinatura */
  document.getElementById("refreshRankingBtn")?.addEventListener("click", () => {
    const activePeriod = rankingPage.querySelector(".filter-btn[data-period].active")?.dataset.period || "total";
    window.loadRanking(activePeriod);
  });
});

function escapeHtml(text) {
  if (!text) return "";
  const d = document.createElement("div");
  d.appendChild(document.createTextNode(String(text)));
  return d.innerHTML;
}
