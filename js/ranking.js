/* ================================================================
   js/ranking.js  –  Ranking (100% Firebase, sem backend)
   ================================================================ */

import "../firebase/session-manager.js";
import { getRanking } from "../firebase/database.js";

/* ════════════════════════════════════════════════════════════════
   Carregar ranking
════════════════════════════════════════════════════════════════ */
window.loadRanking = async function loadRankingPage(period = "total") {
  const podium = document.getElementById("rankingPodium");
  const list   = document.getElementById("rankingList");
  if (!list) return;

  list.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Carregando ranking...</div>';
  if (podium) podium.innerHTML = "";

  try {
    const uid     = window.RPG.getFbUser()?.uid;
    const ranking = await getRanking(period, 50);

    if (!ranking || ranking.length === 0) {
      list.innerHTML = `<div class="empty-state">
        <i class="fas fa-trophy"></i><h3>Ranking vazio</h3>
        <p>Seja o primeiro a completar uma quest!</p></div>`;
      return;
    }

    // Pódio top 3
    if (podium) {
      const top3  = ranking.slice(0, 3);
      const order = [1, 0, 2]; // visual: 2º, 1º, 3º
      podium.innerHTML = order
        .filter(i => top3[i])
        .map(i => renderPodiumItem(top3[i], uid))
        .join("");
    }

    // Lista completa
    const posIcons = { 1:"🥇", 2:"🥈", 3:"🥉" };
    list.innerHTML = ranking.map(r => {
      const isMe  = r.uid === uid;
      const photo = r.photoURL || r.avatar ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(r.nickname||r.username||"?")}&background=1a1a2e&color=c9a84c`;
      return `
      <div class="ranking-item ${isMe ? "is-me" : ""}">
        <span class="rank-position rank-pos-${r.position}">
          ${r.position <= 3 ? posIcons[r.position] : `#${r.position}`}
        </span>
        <img src="${photo}" alt="${escapeHtml(r.nickname||r.username)}"
             class="ranking-avatar"
             onerror="this.src='https://ui-avatars.com/api/?name=?&background=1a1a2e&color=c9a84c'"/>
        <span class="ranking-name">
          ${escapeHtml(r.nickname || r.username || "Aventureiro")}
          ${isMe ? '<span style="color:var(--gold);font-size:.7rem;margin-left:4px">(você)</span>' : ""}
          ${r.badges?.includes("diamond") ? "<span title='Diamante'>💎</span>" : ""}
          ${r.badges?.includes("gold") && !r.badges?.includes("diamond") ? "<span title='Ouro'>🥇</span>" : ""}
        </span>
        <span class="ranking-level">Nv.${r.level||1}</span>
        <span class="ranking-coins">
          <i class="fas fa-coins" style="font-size:.8rem"></i>
          ${(r.coins||0).toLocaleString("pt-BR")}
        </span>
      </div>`;
    }).join("");

    // Minha posição se não aparecer na lista
    const myPos = ranking.find(r => r.uid === uid);
    if (!myPos && uid) {
      const allRanking = await getRanking(period, 1000);
      const pos = allRanking.findIndex(r => r.uid === uid);
      if (pos !== -1) {
        const note = document.createElement("div");
        note.style.cssText = "text-align:center;padding:12px;color:var(--text-secondary);font-size:.8rem;border-top:1px solid var(--border);margin-top:8px;";
        note.textContent = `Sua posição: #${pos + 1}`;
        list.appendChild(note);
      }
    }

  } catch (err) {
    console.error("loadRanking error:", err);
    list.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Erro ao carregar ranking</h3></div>';
  }
};

function renderPodiumItem(user, currentUid) {
  const photo = user.photoURL || user.avatar ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(user.nickname||"?")}&background=1a1a2e&color=c9a84c`;
  const labels = { 1:"🥇", 2:"🥈", 3:"🥉" };
  const isMe   = user.uid === currentUid;

  return `
    <div class="podium-item pos-${user.position} ${isMe ? "is-me" : ""}">
      <img src="${photo}" alt="${escapeHtml(user.nickname||user.username)}"
           class="podium-avatar"
           onerror="this.src='https://ui-avatars.com/api/?name=?&background=1a1a2e&color=c9a84c'"/>
      <span class="podium-name" title="${escapeHtml(user.nickname||user.username)}">
        ${escapeHtml(user.nickname || user.username || "?")}
      </span>
      <span class="podium-coins">
        <i class="fas fa-coins" style="font-size:.7rem"></i>
        ${(user.coins||0).toLocaleString("pt-BR")}
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
});

function escapeHtml(text) {
  if (!text) return "";
  const d = document.createElement("div");
  d.appendChild(document.createTextNode(text));
  return d.innerHTML;
}
