/* ================================================================
   RANKING.JS - Sistema de ranking por período
   ================================================================ */

let currentPeriod = 'total';

// ─── Carregar ranking ────────────────────────────────────────────
async function loadRanking(period = 'total') {
  currentPeriod = period;
  const podium = document.getElementById('rankingPodium');
  const list   = document.getElementById('rankingList');
  if (!list) return;

  list.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Carregando ranking...</div>';
  if (podium) podium.innerHTML = '';

  try {
    const res = await RPG.api(`/api/ranking?period=${period}&limit=50`);
    if (!res) return;
    const { ranking, myPosition } = await res.json();

    if (!ranking || ranking.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-trophy"></i>
          <h3>Ranking vazio</h3>
          <p>Seja o primeiro a completar uma quest!</p>
        </div>`;
      return;
    }

    // Pódio (top 3)
    if (podium) {
      const top3 = ranking.slice(0, 3);
      const order = [1, 0, 2]; // 2nd, 1st, 3rd no pódio visual
      podium.innerHTML = order
        .filter(i => top3[i])
        .map(i => renderPodiumItem(top3[i], i + 1))
        .join('');
    }

    // Lista completa (4+)
    const rest = ranking.slice(3);
    const posIcons = { 1: '🥇', 2: '🥈', 3: '🥉' };

    const listHtml = ranking.map(r => {
      const photo = r.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(r.nickname||'U')}&background=f0c040&color=000&size=38`;
      return `
      <div class="ranking-item ${r.isCurrentUser ? 'is-me' : ''}">
        <span class="rank-position rank-pos-${r.position}">
          ${r.position <= 3 ? posIcons[r.position] : `#${r.position}`}
        </span>
        <img src="${photo}" alt="${escapeHtml(r.nickname)}" class="ranking-avatar"
             onerror="this.src='https://ui-avatars.com/api/?background=f0c040&color=000'"/>
        <span class="ranking-name">
          ${escapeHtml(r.nickname)}
          ${r.isCurrentUser ? '<span style="color:var(--gold);font-size:0.7rem;margin-left:4px">(você)</span>' : ''}
          ${r.badges && r.badges.includes('diamond') ? '<span title="Diamante">💎</span>' : ''}
          ${r.badges && r.badges.includes('gold') && !r.badges.includes('diamond') ? '<span title="Ouro">🥇</span>' : ''}
        </span>
        <span class="ranking-level">Nv.${r.level}</span>
        <span class="ranking-coins">
          <i class="fas fa-coins" style="font-size:0.8rem"></i>
          ${r.coins.toLocaleString('pt-BR')}
        </span>
      </div>`;}
    ).join('');

    list.innerHTML = listHtml;

    // Minha posição se não estiver no top
    if (myPosition && !ranking.find(r => r.isCurrentUser)) {
      const myPosEl = document.createElement('div');
      myPosEl.style.cssText = 'text-align:center;padding:12px;color:var(--text-secondary);font-size:0.8rem;border-top:1px solid var(--border);margin-top:8px;';
      myPosEl.textContent = `Sua posição: #${myPosition}`;
      list.appendChild(myPosEl);
    }
  } catch (err) {
    console.error('loadRanking error:', err);
    list.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Erro ao carregar ranking</h3></div>';
  }
}

// ─── Render pódio ────────────────────────────────────────────────
function renderPodiumItem(user, position) {
  const avatar = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.nickname||'U')}&background=f0c040&color=000&size=56`;
  const labels = { 1: '🥇', 2: '🥈', 3: '🥉' };

  return `
    <div class="podium-item pos-${position}">
      <img src="${avatar}" alt="${escapeHtml(user.nickname)}"
           class="podium-avatar"
           onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'"/>
      <span class="podium-name" title="${escapeHtml(user.nickname)}">${escapeHtml(user.nickname)}</span>
      <span class="podium-coins">
        <i class="fas fa-coins" style="font-size:0.7rem"></i>
        ${user.coins.toLocaleString('pt-BR')}
      </span>
      <div class="podium-stand">${labels[position] || position}</div>
    </div>`;
}

// ─── Setup filtros de período ────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const rankingPage = document.getElementById('page-ranking');
  if (!rankingPage) return;

  rankingPage.querySelectorAll('.filter-btn[data-period]').forEach(btn => {
    btn.addEventListener('click', () => {
      rankingPage.querySelectorAll('.filter-btn[data-period]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadRanking(btn.dataset.period);
    });
  });
});

// ─── Helpers ──────────────────────────────────────────────────── */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(text));
  return div.innerHTML;
}

// Expor funções globalmente (chamadas por home.js)
window.loadRanking = loadRanking;
