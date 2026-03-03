/* ================================================================
   HOME.JS - Dashboard principal, estatísticas e perfil
   ================================================================ */

document.addEventListener('DOMContentLoaded', async () => {
  const user = await checkAuth();
  if (!user) return;

  // Mostrar link admin
  if (user.role === 'admin') {
    const adminLink = document.getElementById('adminLink');
    if (adminLink) adminLink.style.display = 'flex';
  }

  // Carregar estatísticas iniciais
  await loadStats();
  await loadQuests();
  await loadMyQuests();
  await loadRanking();
  setupProfile(user);

  // Expose global page loader
  window.loadPage = async (page) => {
    switch (page) {
      case 'stats':    await loadStats(); break;
      case 'quests':   await loadQuests(); break;
      case 'myquests': await loadMyQuests(); break;
      case 'ranking':  await loadRanking(); break;
      case 'profile':  setupProfile(window.RPG.user); break;
    }
  };
});

// ─── Carregar estatísticas ───────────────────────────────────────
async function loadStats() {
  try {
    const res = await RPG.api('/api/users/stats');
    if (!res) return;
    const data = await res.json();

    // Atualizar sidebar
    const avatar = data.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(data.username)}&background=f0c040&color=000&bold=true`;
    document.getElementById('sidebarAvatar').src = avatar;
    document.getElementById('sidebarName').textContent = data.nickname || data.username;
    document.getElementById('sidebarLevel').textContent = data.level;
    document.getElementById('sidebarCoins').textContent = data.coins.toLocaleString('pt-BR');
    document.getElementById('topbarCoins').textContent = data.coins.toLocaleString('pt-BR');

    const xpText = `${data.xpProgress} / ${data.xpForNextLevel}`;
    document.getElementById('xpText').textContent = xpText;
    document.getElementById('xpFill').style.width = `${data.xpPercent}%`;

    // Stat cards
    document.getElementById('statCoins').textContent    = data.coins.toLocaleString('pt-BR');
    document.getElementById('statXP').textContent       = data.xp.toLocaleString('pt-BR');
    document.getElementById('statLevel').textContent    = data.level;
    document.getElementById('statCompleted').textContent= data.quests.completed;
    document.getElementById('statActive').textContent   = data.quests.active;
    document.getElementById('statRejected').textContent = data.quests.rejected;

    // XP progress bar grande
    document.getElementById('xpProgressText').textContent = xpText + ' XP';
    document.getElementById('xpFillLarge').style.width = `${data.xpPercent}%`;
    document.getElementById('xpPercent').textContent = `${data.xpPercent}%`;
    document.getElementById('nextLevel').textContent = data.level + 1;

    // Moedas por período
    document.getElementById('coinsDaily').textContent   = data.coinsDaily.toLocaleString('pt-BR');
    document.getElementById('coinsWeekly').textContent  = data.coinsWeekly.toLocaleString('pt-BR');
    document.getElementById('coinsMonthly').textContent = data.coinsMonthly.toLocaleString('pt-BR');

    // Badges
    const badgesGrid = document.getElementById('badgesGrid');
    const badgeLabels = {
      first_quest: { label: '⚡ Primeira Quest', css: 'badge-first_quest' },
      bronze:      { label: '🥉 Bronze (10 quests)', css: 'badge-bronze' },
      silver:      { label: '🥈 Prata (50 quests)', css: 'badge-silver' },
      gold:        { label: '🥇 Ouro (100 quests)', css: 'badge-gold' },
      diamond:     { label: '💎 Diamante (250 quests)', css: 'badge-diamond' }
    };

    if (data.badges && data.badges.length > 0) {
      badgesGrid.innerHTML = data.badges.map(b => {
        const info = badgeLabels[b] || { label: b, css: '' };
        return `<span class="badge-item ${info.css}">${info.label}</span>`;
      }).join('');
    } else {
      badgesGrid.innerHTML = '<p class="no-badges">Complete quests para ganhar conquistas!</p>';
    }

    // Atualizar dados globais
    window.RPG.user = { ...window.RPG.user, ...data };

    // Atualizar badges de nav
    if (data.quests.pending > 0) {
      document.getElementById('pendingBadge').textContent = data.quests.pending;
    }

    // Setup de perfil com dados frescos
    setupProfile(data);
  } catch (err) {
    console.error('loadStats error:', err);
    showToast('Erro ao carregar estatísticas', 'error');
  }
}

// ─── Setup de perfil ────────────────────────────────────────────
function setupProfile(user) {
  if (!user) return;

  const avatar = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username || 'U')}&background=f0c040&color=000&bold=true`;
  const profileAvatar = document.getElementById('profileAvatar');
  const profileUsername = document.getElementById('profileUsername');
  const profileDiscordTag = document.getElementById('profileDiscordTag');
  const profileLevel = document.getElementById('profileLevel');
  const nicknameInput = document.getElementById('nicknameInput');
  const saveNicknameBtn = document.getElementById('saveNicknameBtn');

  if (profileAvatar) profileAvatar.src = avatar;
  if (profileUsername) profileUsername.textContent = user.nickname || user.username;
  if (profileDiscordTag) profileDiscordTag.textContent = `@${user.username}`;
  if (profileLevel) profileLevel.textContent = `Nível ${user.level || 1}`;
  if (nicknameInput) nicknameInput.value = user.nickname || user.username || '';

  const roleBadge = document.getElementById('profileRoleBadge');
  if (roleBadge) {
    roleBadge.textContent = user.role === 'admin' ? '👑 Administrador' : '⚔️ Aventureiro';
    if (user.role === 'admin') {
      roleBadge.style.background = 'rgba(168,85,247,0.2)';
      roleBadge.style.color = '#a855f7';
      roleBadge.style.border = '1px solid rgba(168,85,247,0.3)';
    }
  }

  // Save nickname
  saveNicknameBtn?.addEventListener('click', async () => {
    const nickname = nicknameInput.value.trim();
    if (!nickname || nickname.length < 2) {
      showToast('Nickname deve ter pelo menos 2 caracteres', 'warning');
      return;
    }

    saveNicknameBtn.disabled = true;
    saveNicknameBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

    try {
      const res = await RPG.api('/api/users/nickname', {
        method: 'PUT',
        body: JSON.stringify({ nickname })
      });

      if (res && res.ok) {
        showToast('Nickname atualizado com sucesso! 🎉', 'success');
        window.RPG.user.nickname = nickname;
        document.getElementById('sidebarName').textContent = nickname;
        document.getElementById('profileUsername').textContent = nickname;
      } else {
        const err = await res.json();
        showToast(err.error || 'Erro ao atualizar nickname', 'error');
      }
    } catch (err) {
      showToast('Erro de conexão', 'error');
    } finally {
      saveNicknameBtn.disabled = false;
      saveNicknameBtn.innerHTML = '<i class="fas fa-save"></i> Salvar';
    }
  });
}
