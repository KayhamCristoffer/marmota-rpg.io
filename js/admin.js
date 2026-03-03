/* ================================================================
   ADMIN.JS - Painel administrativo
   ================================================================ */

document.addEventListener('DOMContentLoaded', async () => {
  // Verificar se é admin
  const user = await checkAuth(true);
  if (!user) return;

  // Preencher avatar do admin
  document.getElementById('sidebarAvatar').src = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username||'A')}&background=f0c040&color=000`;
  document.getElementById('sidebarName').textContent = user.nickname || user.username;

  // Carregar página inicial
  await loadSubmissions();

  window.loadPage = async (page) => {
    switch (page) {
      case 'submissions':    await loadSubmissions(); break;
      case 'quests':         await loadAdminQuests(); break;
      case 'users':          await loadUsers(); break;
      case 'ranking-admin':  setupRankingAdmin(); break;
    }
  };
});

// ─── SUBMISSIONS ─────────────────────────────────────────────────
async function loadSubmissions() {
  const list = document.getElementById('submissionsList');
  if (!list) return;

  list.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Carregando...</div>';

  try {
    const res = await RPG.api('/api/admin/submissions');
    if (!res) return;
    const submissions = await res.json();

    const count = document.getElementById('submissionsCount');
    if (count) count.textContent = `${submissions.length} pendente(s)`;

    const pendingCount = document.getElementById('pendingCount');
    if (pendingCount) pendingCount.textContent = submissions.length > 0 ? submissions.length : '';

    if (submissions.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-inbox"></i>
          <h3>Sem revisões pendentes</h3>
          <p>Tudo em dia! 🎉</p>
        </div>`;
      return;
    }

    list.innerHTML = submissions.map(s => renderSubmission(s)).join('');

    // Bind actions
    list.querySelectorAll('.btn-approve').forEach(btn => {
      btn.addEventListener('click', () => approveSubmission(btn.dataset.id));
    });

    list.querySelectorAll('.btn-reject').forEach(btn => {
      btn.addEventListener('click', () => rejectSubmission(btn.dataset.id));
    });

    list.querySelectorAll('.btn-view-print').forEach(btn => {
      btn.addEventListener('click', () => viewPrint(btn.dataset.url));
    });
  } catch (err) {
    console.error('loadSubmissions error:', err);
    list.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Erro ao carregar</h3></div>';
  }
}

function renderSubmission(s) {
  const user  = s.userId;
  const quest = s.questId;
  if (!user || !quest) return '';

  const avatar = s.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(s.username||'U')}&background=f0c040&color=000`;

  return `
    <div class="submission-item" id="sub-${s._id}">
      <div class="submission-user">
        <img src="${avatar}" alt="${escapeHtml(user.nickname || user.username)}" class="submission-avatar"
             onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'"/>
        <div>
          <div class="submission-name">${escapeHtml(user.nickname || user.username)}</div>
          <div class="submission-quest-name">${escapeHtml(quest.title)}</div>
        </div>
      </div>
      <div class="submission-reward">
        <i class="fas fa-coins"></i> +${quest.rewardCoins} moedas
        ${quest.rewardXP > 0 ? `<span style="color:var(--purple-light);font-size:0.8rem"> +${quest.rewardXP} XP</span>` : ''}
      </div>
      <div class="submission-actions">
        ${s.printUrl ? `
          <button class="btn-secondary btn-view-print" data-url="${s.printUrl}" style="font-size:0.78rem;padding:6px 12px;">
            <i class="fas fa-image"></i> Ver Print
          </button>` : '<span style="color:var(--text-muted);font-size:0.75rem">Sem print</span>'}
        <button class="btn-approve" data-id="${s._id}">
          <i class="fas fa-check"></i> Aprovar
        </button>
        <button class="btn-reject" data-id="${s._id}">
          <i class="fas fa-times"></i> Rejeitar
        </button>
      </div>
    </div>`;
}

async function approveSubmission(id) {
  const item = document.getElementById(`sub-${id}`);
  if (item) item.style.opacity = '0.5';

  try {
    const res = await RPG.api(`/api/admin/submissions/${id}/approve`, { method: 'POST' });
    if (!res) return;
    const data = await res.json();

    if (res.ok) {
      showToast(`✅ ${data.message}`, 'success');
      if (item) item.remove();
      updatePendingCount(-1);
    } else {
      showToast(data.error || 'Erro ao aprovar', 'error');
      if (item) item.style.opacity = '1';
    }
  } catch (err) {
    showToast('Erro de conexão', 'error');
    if (item) item.style.opacity = '1';
  }
}

async function rejectSubmission(id) {
  const note = prompt('Motivo da rejeição (opcional):') || 'Comprovante inválido';
  const item = document.getElementById(`sub-${id}`);
  if (item) item.style.opacity = '0.5';

  try {
    const res = await RPG.api(`/api/admin/submissions/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ note })
    });

    if (res && res.ok) {
      showToast('❌ Submissão rejeitada', 'warning');
      if (item) item.remove();
      updatePendingCount(-1);
    } else {
      if (item) item.style.opacity = '1';
    }
  } catch (err) {
    showToast('Erro de conexão', 'error');
    if (item) item.style.opacity = '1';
  }
}

function viewPrint(url) {
  const modal = document.getElementById('printModal');
  const img   = document.getElementById('printModalImg');
  if (!modal || !img) return;
  img.src = url;
  modal.style.display = 'flex';
}

document.getElementById('closePrintModal')?.addEventListener('click', () => {
  document.getElementById('printModal').style.display = 'none';
});

function updatePendingCount(delta) {
  const badge = document.getElementById('pendingCount');
  const countEl = document.getElementById('submissionsCount');
  if (!badge) return;
  const current = parseInt(badge.textContent) || 0;
  const next = Math.max(0, current + delta);
  badge.textContent = next > 0 ? next : '';
  if (countEl) countEl.textContent = `${next} pendente(s)`;
}

// ─── ADMIN QUESTS ────────────────────────────────────────────────
async function loadAdminQuests() {
  const list = document.getElementById('adminQuestsList');
  if (!list) return;

  list.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Carregando...</div>';

  try {
    const res = await RPG.api('/api/admin/quests');
    if (!res) return;
    const quests = await res.json();

    if (quests.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-scroll"></i>
          <h3>Nenhuma quest criada</h3>
          <p>Clique em "Nova Quest" para criar!</p>
        </div>`;
      return;
    }

    list.innerHTML = quests.map(q => renderAdminQuestItem(q)).join('');

    list.querySelectorAll('.btn-edit-quest').forEach(btn => {
      btn.addEventListener('click', () => openQuestModal(btn.dataset.id));
    });

    list.querySelectorAll('.btn-toggle-quest').forEach(btn => {
      btn.addEventListener('click', () => toggleQuest(btn.dataset.id));
    });

    list.querySelectorAll('.btn-delete-quest').forEach(btn => {
      btn.addEventListener('click', () => deleteQuest(btn.dataset.id));
    });
  } catch (err) {
    console.error('loadAdminQuests error:', err);
  }
}

function renderAdminQuestItem(q) {
  const typeLabels = { daily: '☀️ Diária', weekly: '📅 Semanal', monthly: '🗓️ Mensal', event: '⭐ Evento' };

  return `
    <div class="admin-quest-item ${q.isActive ? '' : 'inactive'}" id="aq-${q._id}">
      <div class="admin-quest-info">
        <div class="admin-quest-title">${escapeHtml(q.title)}</div>
        <div class="admin-quest-meta">
          <span>${typeLabels[q.type] || q.type}</span>
          <span><i class="fas fa-coins"></i> ${q.rewardCoins} moedas</span>
          ${q.rewardXP > 0 ? `<span><i class="fas fa-star"></i> ${q.rewardXP} XP</span>` : ''}
          <span><i class="fas fa-users"></i> ${q.currentUsers}${q.maxUsers ? `/${q.maxUsers}` : ''} usuários</span>
          <span style="color:${q.isActive ? 'var(--green)' : 'var(--red)'}">
            ${q.isActive ? '● Ativa' : '● Inativa'}
          </span>
          ${q.expiresAt ? `<span style="color:var(--text-muted)">Expira: ${new Date(q.expiresAt).toLocaleDateString('pt-BR')}</span>` : ''}
        </div>
      </div>
      <div class="admin-quest-actions">
        <button class="btn-edit-quest" data-id="${q._id}">
          <i class="fas fa-edit"></i> Editar
        </button>
        <button class="btn-toggle-quest ${q.isActive ? 'deactivate' : ''}" data-id="${q._id}">
          <i class="fas fa-${q.isActive ? 'pause' : 'play'}"></i>
          ${q.isActive ? 'Desativar' : 'Ativar'}
        </button>
        <button class="btn-delete-quest" data-id="${q._id}">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </div>`;
}

// ─── Quest Modal ──────────────────────────────────────────────────
let editingQuestId = null;
let allQuestsData = [];

document.getElementById('createQuestBtn')?.addEventListener('click', () => openQuestModal(null));

async function openQuestModal(questId) {
  editingQuestId = questId;
  const modal = document.getElementById('questModal');
  const title = document.getElementById('questModalTitle');

  // Limpar form
  document.getElementById('questForm').reset();
  document.getElementById('questId').value = '';
  document.getElementById('questImageRequired').checked = true;

  if (questId) {
    // Edição - buscar dados
    title.innerHTML = '<i class="fas fa-edit"></i> Editar Quest';
    try {
      const res = await RPG.api('/api/admin/quests');
      if (!res) return;
      const quests = await res.json();
      const q = quests.find(x => x._id === questId);
      if (q) {
        document.getElementById('questId').value = q._id;
        document.getElementById('questTitle').value = q.title;
        document.getElementById('questType').value = q.type;
        document.getElementById('questDescription').value = q.description;
        document.getElementById('questRewardCoins').value = q.rewardCoins;
        document.getElementById('questRewardXP').value = q.rewardXP || 0;
        document.getElementById('questMaxUsers').value = q.maxUsers || '';
        document.getElementById('questMinLevel').value = q.minLevel || 1;
        document.getElementById('questEventName').value = q.eventName || '';
        document.getElementById('questImageRequired').checked = q.imageRequired !== false;
        if (q.expiresAt) {
          const d = new Date(q.expiresAt);
          document.getElementById('questExpiresAt').value = d.toISOString().slice(0, 16);
        }
      }
    } catch (err) {
      showToast('Erro ao carregar dados da quest', 'error');
    }
  } else {
    title.innerHTML = '<i class="fas fa-plus"></i> Nova Quest';
  }

  modal.style.display = 'flex';
}

document.getElementById('closeQuestModal')?.addEventListener('click', () => {
  document.getElementById('questModal').style.display = 'none';
});

document.getElementById('cancelQuestModal')?.addEventListener('click', () => {
  document.getElementById('questModal').style.display = 'none';
});

document.getElementById('saveQuestBtn')?.addEventListener('click', async () => {
  const id       = document.getElementById('questId').value;
  const title    = document.getElementById('questTitle').value.trim();
  const type     = document.getElementById('questType').value;
  const desc     = document.getElementById('questDescription').value.trim();
  const coins    = document.getElementById('questRewardCoins').value;
  const xp       = document.getElementById('questRewardXP').value;
  const maxUsers = document.getElementById('questMaxUsers').value;
  const minLevel = document.getElementById('questMinLevel').value;
  const expires  = document.getElementById('questExpiresAt').value;
  const eventName= document.getElementById('questEventName').value.trim();
  const imgReq   = document.getElementById('questImageRequired').checked;

  if (!title || !type || !desc || !coins) {
    showToast('Preencha todos os campos obrigatórios!', 'warning');
    return;
  }

  const payload = {
    title, type, description: desc,
    rewardCoins: coins, rewardXP: xp || 0,
    maxUsers: maxUsers || null, minLevel: minLevel || 1,
    expiresAt: expires || null, eventName: eventName || null,
    imageRequired: imgReq
  };

  const saveBtn = document.getElementById('saveQuestBtn');
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

  try {
    const url = id ? `/api/admin/quests/${id}` : '/api/admin/quests';
    const method = id ? 'PUT' : 'POST';

    const res = await RPG.api(url, {
      method,
      body: JSON.stringify(payload)
    });

    if (res && res.ok) {
      showToast(id ? '✅ Quest atualizada!' : '✅ Quest criada!', 'success');
      document.getElementById('questModal').style.display = 'none';
      await loadAdminQuests();
    } else {
      const err = await res.json();
      showToast(err.error || 'Erro ao salvar quest', 'error');
    }
  } catch (err) {
    showToast('Erro de conexão', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="fas fa-save"></i> Salvar Quest';
  }
});

async function toggleQuest(id) {
  try {
    const res = await RPG.api(`/api/admin/quests/${id}/toggle`, { method: 'PATCH' });
    if (!res) return;
    const data = await res.json();
    showToast(data.message, 'info');
    await loadAdminQuests();
  } catch (err) {
    showToast('Erro ao alterar status', 'error');
  }
}

async function deleteQuest(id) {
  if (!confirm('Tem certeza que deseja deletar esta quest? Esta ação é irreversível!')) return;

  try {
    const res = await RPG.api(`/api/admin/quests/${id}`, { method: 'DELETE' });
    if (res && res.ok) {
      showToast('🗑️ Quest deletada!', 'success');
      document.getElementById(`aq-${id}`)?.remove();
    }
  } catch (err) {
    showToast('Erro ao deletar', 'error');
  }
}

// ─── USERS ───────────────────────────────────────────────────────
async function loadUsers() {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="5" class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></td></tr>';

  try {
    const res = await RPG.api('/api/admin/users');
    if (!res) return;
    const users = await res.json();

    tbody.innerHTML = users.map(u => {
      const userPhoto = u.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.username||'U')}&background=f0c040&color=000&size=32`;
      return `
      <tr>
        <td>
          <div class="table-user-cell">
            <img src="${userPhoto}" alt="" class="table-avatar" onerror="this.src='https://ui-avatars.com/api/?background=f0c040&color=000'"/>
            <div>
              <div style="font-family:var(--font-title);font-size:0.85rem">${escapeHtml(u.nickname || u.username)}</div>
              <div style="font-size:0.7rem;color:var(--text-muted)">@${escapeHtml(u.username)}</div>
            </div>
          </div>
        </td>
        <td style="font-family:var(--font-title);color:var(--gold)">${u.level || 1}</td>
        <td style="color:var(--gold)"><i class="fas fa-coins" style="font-size:0.8rem"></i> ${(u.coins||0).toLocaleString('pt-BR')}</td>
        <td>
          <span style="padding:2px 10px;border-radius:10px;font-size:0.7rem;font-weight:700;
                background:${u.role === 'admin' ? 'rgba(168,85,247,0.2)' : 'rgba(240,192,64,0.1)'};
                color:${u.role === 'admin' ? 'var(--purple-light)' : 'var(--text-secondary)'}">
            ${u.role === 'admin' ? '👑 Admin' : '⚔️ User'}
          </span>
        </td>
        <td>
          <button class="btn-edit-quest" onclick="toggleUserRole('${u.uid}','${u.role}')" style="font-size:0.75rem;padding:5px 10px;">
            <i class="fas fa-user-shield"></i>
            ${u.role === 'admin' ? 'Remover Admin' : 'Tornar Admin'}
          </button>
        </td>
      </tr>`;
    }).join('');

    // Search
    document.getElementById('userSearch')?.addEventListener('input', function () {
      const q = this.value.toLowerCase();
      document.querySelectorAll('#usersTableBody tr').forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });
  } catch (err) {
    console.error('loadUsers error:', err);
  }
}

async function toggleUserRole(uid, currentRole) {
  const newRole = currentRole === 'admin' ? 'user' : 'admin';
  if (!confirm(`${newRole === 'admin' ? 'Tornar este usuário ADMIN?' : 'Remover cargo de admin deste usuário?'}`)) return;

  try {
    const res = await RPG.api(`/api/admin/users/${uid}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role: newRole })
    });

    if (res && res.ok) {
      showToast(`✅ Role atualizado para ${newRole}`, 'success');
      await loadUsers();
    }
  } catch (err) {
    showToast('Erro ao atualizar role', 'error');
  }
}

// ─── RANKING ADMIN ───────────────────────────────────────────────
function setupRankingAdmin() {
  ['resetDaily', 'resetWeekly', 'resetMonthly'].forEach(btnId => {
    const btn = document.getElementById(btnId);
    btn?.addEventListener('click', async () => {
      const period = btn.dataset.period;
      if (!confirm(`Resetar o ranking ${period}? Esta ação é irreversível!`)) return;

      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Resetando...';

      try {
        const res = await RPG.api('/api/admin/ranking/reset', {
          method: 'POST',
          body: JSON.stringify({ period })
        });

        if (res && res.ok) {
          showToast(`✅ Ranking ${period} resetado com sucesso!`, 'success');
        } else {
          showToast('Erro ao resetar ranking', 'error');
        }
      } catch (err) {
        showToast('Erro de conexão', 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-rotate"></i> Resetar Agora';
      }
    });
  });
}

// ─── Helpers ─────────────────────────────────────────────────────
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(text));
  return div.innerHTML;
}
