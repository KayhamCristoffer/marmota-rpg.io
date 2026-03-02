/* ================================================================
   QUESTS.JS - Pegar quests e enviar prints
   ================================================================ */

let currentFilter = 'all';
let selectedUserQuestId = null;

// ─── Carregar quests disponíveis ─────────────────────────────────
async function loadQuests(filter = 'all') {
  currentFilter = filter;
  const grid = document.getElementById('questsGrid');
  if (!grid) return;

  grid.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Carregando quests...</div>';

  try {
    const url = filter !== 'all' ? `/api/quests?type=${filter}` : '/api/quests';
    const res = await RPG.api(url);
    if (!res) return;
    const quests = await res.json();

    if (quests.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <i class="fas fa-scroll"></i>
          <h3>Nenhuma quest disponível</h3>
          <p>Volte mais tarde para novas missões!</p>
        </div>`;
      return;
    }

    grid.innerHTML = quests.map(q => renderQuestCard(q)).join('');

    // Bind botões de pegar quest
    grid.querySelectorAll('.btn-take-quest[data-action="take"]').forEach(btn => {
      btn.addEventListener('click', () => takeQuest(btn.dataset.id));
    });

    // Atualizar badge de quests disponíveis
    const available = quests.filter(q => q.userStatus === null && q.isAvailable).length;
    const badge = document.getElementById('availableBadge');
    if (badge) badge.textContent = available > 0 ? available : '';
  } catch (err) {
    console.error('loadQuests error:', err);
    grid.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Erro ao carregar</h3><p>Verifique sua conexão</p></div>';
  }
}

// ─── Render card de quest ────────────────────────────────────────
function renderQuestCard(q) {
  const typeLabels = {
    daily:   { label: '☀️ Diária',  css: 'type-daily' },
    weekly:  { label: '📅 Semanal', css: 'type-weekly' },
    monthly: { label: '🗓️ Mensal',  css: 'type-monthly' },
    event:   { label: '⭐ Evento',  css: 'type-event' }
  };

  const typeInfo = typeLabels[q.type] || { label: q.type, css: '' };

  let btnHtml = '';
  const status = q.userStatus;

  if (status === 'active') {
    btnHtml = `<button class="btn-take-quest taken" disabled>📜 Em progresso</button>`;
  } else if (status === 'pending_review') {
    btnHtml = `<button class="btn-take-quest pending" disabled>⏳ Em análise</button>`;
  } else if (status === 'completed') {
    btnHtml = `<button class="btn-take-quest completed" disabled>✅ Concluída</button>`;
  } else if (status === 'rejected') {
    btnHtml = `<button class="btn-take-quest taken" disabled>❌ Rejeitada</button>`;
  } else if (!q.isAvailable) {
    btnHtml = `<button class="btn-take-quest taken" disabled>🔒 Esgotada</button>`;
  } else {
    btnHtml = `<button class="btn-take-quest" data-action="take" data-id="${q._id}">⚔️ Pegar Quest</button>`;
  }

  const expiresHtml = q.expiresAt
    ? `<span class="quest-expires"><i class="fas fa-clock"></i> Expira: ${new Date(q.expiresAt).toLocaleDateString('pt-BR')}</span>`
    : '';

  const slotsHtml = q.maxUsers
    ? `<span class="quest-slots"><i class="fas fa-users"></i> ${q.currentUsers}/${q.maxUsers}</span>`
    : '';

  const xpHtml = q.rewardXP > 0
    ? `<span class="xp-reward">+${q.rewardXP} XP</span>`
    : '';

  const levelHtml = q.minLevel > 1
    ? `<span style="font-size:0.75rem;color:var(--text-muted)"><i class="fas fa-lock"></i> Nível ${q.minLevel}+</span>`
    : '';

  return `
    <div class="quest-card" data-type="${q.type}" data-id="${q._id}">
      <div class="quest-type-badge ${typeInfo.css}">${typeInfo.label}</div>
      <h3 class="quest-title">${escapeHtml(q.title)}</h3>
      <p class="quest-description">${escapeHtml(q.description)}</p>
      <div class="quest-meta">
        <span class="quest-reward">
          <i class="fas fa-coins"></i> +${q.rewardCoins} moedas ${xpHtml}
        </span>
        ${slotsHtml}
        ${levelHtml}
        ${expiresHtml}
      </div>
      ${btnHtml}
    </div>`;
}

// ─── Pegar quest ─────────────────────────────────────────────────
async function takeQuest(questId) {
  const btn = document.querySelector(`.btn-take-quest[data-id="${questId}"]`);
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  }

  try {
    const res = await RPG.api(`/api/quests/${questId}/take`, { method: 'POST' });
    if (!res) return;

    if (res.ok) {
      showToast('🗡️ Quest aceita! Agora complete a missão!', 'success');
      await loadQuests(currentFilter);
      await loadMyQuests();

      // Atualizar badge de ativas
      const statsRes = await RPG.api('/api/users/stats');
      if (statsRes) {
        const stats = await statsRes.json();
        const pendingBadge = document.getElementById('pendingBadge');
        if (pendingBadge) pendingBadge.textContent = stats.quests.active > 0 ? stats.quests.active : '';
      }
    } else {
      const err = await res.json();
      showToast(err.error || 'Erro ao pegar quest', 'error');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '⚔️ Pegar Quest';
      }
    }
  } catch (err) {
    showToast('Erro de conexão', 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '⚔️ Pegar Quest'; }
  }
}

// ─── Carregar minhas quests ──────────────────────────────────────
async function loadMyQuests(filter = 'all') {
  const list = document.getElementById('myQuestsList');
  if (!list) return;

  list.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Carregando...</div>';

  try {
    const url = filter !== 'all' ? `/api/quests/my?status=${filter}` : '/api/quests/my';
    const res = await RPG.api(url);
    if (!res) return;
    const myQuests = await res.json();

    if (myQuests.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-scroll"></i>
          <h3>Nenhuma quest aqui</h3>
          <p>Vá em "Pegar Quests" para começar sua jornada!</p>
        </div>`;
      return;
    }

    list.innerHTML = myQuests.map(uq => renderMyQuestItem(uq)).join('');

    // Bind botões de submit
    list.querySelectorAll('.btn-submit-quest').forEach(btn => {
      btn.addEventListener('click', () => openSubmitModal(btn.dataset.id, btn.dataset.title));
    });
  } catch (err) {
    console.error('loadMyQuests error:', err);
    list.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Erro ao carregar</h3></div>';
  }
}

// ─── Render item de minha quest ──────────────────────────────────
function renderMyQuestItem(uq) {
  const quest = uq.questId;
  if (!quest) return '';

  const statusLabels = {
    active:         { label: 'Ativa',       css: 'status-active' },
    pending_review: { label: 'Em Análise',  css: 'status-pending_review' },
    completed:      { label: 'Concluída',   css: 'status-completed' },
    rejected:       { label: 'Rejeitada',   css: 'status-rejected' },
    failed:         { label: 'Falhou',      css: 'status-failed' }
  };

  const statusInfo = statusLabels[uq.status] || { label: uq.status, css: '' };

  const typeColors = {
    daily: 'var(--orange)', weekly: 'var(--blue)',
    monthly: 'var(--purple-light)', event: 'var(--gold)'
  };

  const iconColors = typeColors[quest.type] || 'var(--gold)';

  let actionBtn = '';
  if (uq.status === 'active') {
    actionBtn = `<button class="btn-submit-quest" data-id="${uq._id}" data-title="${escapeHtml(quest.title)}">
      <i class="fas fa-upload"></i> Enviar Print
    </button>`;
  } else if (uq.status === 'pending_review') {
    actionBtn = `<button class="btn-submit-quest" style="background:rgba(249,115,22,0.15);color:var(--orange)" disabled>
      <i class="fas fa-clock"></i> Aguardando
    </button>`;
  } else if (uq.status === 'completed') {
    actionBtn = `<button class="btn-submit-quest" style="background:rgba(34,197,94,0.15);color:var(--green)" disabled>
      <i class="fas fa-check"></i> +${quest.rewardCoins} moedas
    </button>`;
  }

  return `
    <div class="my-quest-item">
      <div class="my-quest-icon" style="background:rgba(255,255,255,0.05);color:${iconColors}">
        <i class="fas fa-scroll"></i>
      </div>
      <div class="my-quest-info">
        <div class="my-quest-title">${escapeHtml(quest.title)}</div>
        <div class="my-quest-meta">
          <span class="status-badge ${statusInfo.css}">${statusInfo.label}</span>
          <span><i class="fas fa-coins"></i> ${quest.rewardCoins} moedas</span>
          <span style="font-size:0.7rem;color:var(--text-muted)">
            ${new Date(uq.takenAt).toLocaleDateString('pt-BR')}
          </span>
          ${uq.reviewNote ? `<span style="color:var(--red);font-size:0.75rem">❌ ${escapeHtml(uq.reviewNote)}</span>` : ''}
        </div>
      </div>
      ${actionBtn}
    </div>`;
}

// ─── Modal de envio de print ─────────────────────────────────────
function openSubmitModal(userQuestId, questTitle) {
  selectedUserQuestId = userQuestId;
  document.getElementById('submitQuestTitle').textContent = `Quest: ${questTitle}`;
  document.getElementById('submitModal').style.display = 'flex';
  document.getElementById('imagePreview').style.display = 'none';
  document.getElementById('uploadArea').style.display = 'block';
  document.getElementById('printInput').value = '';
}

document.addEventListener('DOMContentLoaded', () => {
  // Modal controls
  const submitModal = document.getElementById('submitModal');
  const closeSubmitModal = document.getElementById('closeSubmitModal');
  const cancelSubmitBtn = document.getElementById('cancelSubmitBtn');
  const confirmSubmitBtn = document.getElementById('confirmSubmitBtn');
  const uploadArea = document.getElementById('uploadArea');
  const printInput = document.getElementById('printInput');
  const imagePreview = document.getElementById('imagePreview');
  const previewImg = document.getElementById('previewImg');
  const removeImgBtn = document.getElementById('removeImgBtn');

  if (!submitModal) return;

  const closeModal = () => {
    submitModal.style.display = 'none';
    selectedUserQuestId = null;
  };

  closeSubmitModal?.addEventListener('click', closeModal);
  cancelSubmitBtn?.addEventListener('click', closeModal);

  // Click fora do modal para fechar
  submitModal?.addEventListener('click', (e) => {
    if (e.target === submitModal) closeModal();
  });

  // Upload area click
  uploadArea?.addEventListener('click', () => printInput?.click());

  // Drag & Drop
  uploadArea?.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
  });

  uploadArea?.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));

  uploadArea?.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  });

  printInput?.addEventListener('change', (e) => {
    if (e.target.files[0]) handleFileSelect(e.target.files[0]);
  });

  removeImgBtn?.addEventListener('click', () => {
    printInput.value = '';
    imagePreview.style.display = 'none';
    uploadArea.style.display = 'block';
    previewImg.src = '';
  });

  function handleFileSelect(file) {
    if (!file.type.startsWith('image/')) {
      showToast('Apenas imagens são permitidas!', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('Imagem muito grande (máx. 5MB)', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      previewImg.src = e.target.result;
      imagePreview.style.display = 'block';
      uploadArea.style.display = 'none';
    };
    reader.readAsDataURL(file);
  }

  // Confirmar envio
  confirmSubmitBtn?.addEventListener('click', async () => {
    if (!selectedUserQuestId) return;
    if (!printInput.files[0]) {
      showToast('Selecione uma imagem como comprovante!', 'warning');
      return;
    }

    confirmSubmitBtn.disabled = true;
    confirmSubmitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

    const formData = new FormData();
    formData.append('print', printInput.files[0]);

    try {
      const res = await fetch(`/api/quests/${selectedUserQuestId}/submit`, {
        method: 'POST',
        credentials: 'include',
        body: formData
      });

      if (res.ok) {
        showToast('✅ Comprovante enviado! Aguardando revisão do admin.', 'success');
        closeModal();
        await loadMyQuests();
        await loadStats();
      } else {
        const err = await res.json();
        showToast(err.error || 'Erro ao enviar comprovante', 'error');
      }
    } catch (err) {
      showToast('Erro de conexão', 'error');
    } finally {
      confirmSubmitBtn.disabled = false;
      confirmSubmitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar para Revisão';
    }
  });

  // Filtros de quests
  document.querySelectorAll('#page-quests .filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#page-quests .filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadQuests(btn.dataset.filter);
    });
  });

  // Filtros de minhas quests
  document.querySelectorAll('#page-myquests .filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#page-myquests .filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadMyQuests(btn.dataset.filter);
    });
  });
});

// ─── Utilitário ──────────────────────────────────────────────────
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(text));
  return div.innerHTML;
}
