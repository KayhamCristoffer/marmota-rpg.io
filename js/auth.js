/* ================================================================
   AUTH.JS - Autenticação e verificação do usuário
   ================================================================ */

const API = '';  // mesmo domínio (backend serve o frontend)

// ─── Estado global do usuário ────────────────────────────────────
window.RPG = {
  user: null,
  api: async (url, options = {}) => {
    const res = await fetch(url, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });

    if (res.status === 401) {
      window.location.href = '/';
      return null;
    }

    return res;
  }
};

// ─── Toast notification ──────────────────────────────────────────
window.showToast = (message, type = 'info', duration = 3000) => {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const icons = {
    success: 'fa-check-circle',
    error:   'fa-times-circle',
    warning: 'fa-exclamation-triangle',
    info:    'fa-info-circle'
  };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <i class="fas ${icons[type] || icons.info}"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration + 300);
};

// ─── Verificar autenticação (redireciona se não logado) ──────────
async function checkAuth(requireAdmin = false) {
  try {
    const res = await fetch('/auth/me', { credentials: 'include' });

    if (!res.ok) {
      window.location.href = '/';
      return null;
    }

    const user = await res.json();
    window.RPG.user = user;

    if (requireAdmin && user.role !== 'admin') {
      window.location.href = '/home.html';
      return null;
    }

    return user;
  } catch (err) {
    window.location.href = '/';
    return null;
  }
}

// ─── Sidebar toggle ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.getElementById('sidebar');
  const mainContent = document.getElementById('mainContent');
  const sidebarToggle = document.getElementById('sidebarToggle');
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');

  if (!sidebar) return;

  // Desktop toggle
  sidebarToggle?.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    mainContent?.classList.toggle('collapsed');
    localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed'));
  });

  // Restore sidebar state
  if (localStorage.getItem('sidebarCollapsed') === 'true') {
    sidebar.classList.add('collapsed');
    mainContent?.classList.add('collapsed');
  }

  // Mobile menu
  let overlay = document.createElement('div');
  overlay.className = 'mobile-overlay';
  document.body.appendChild(overlay);

  mobileMenuBtn?.addEventListener('click', () => {
    sidebar.classList.toggle('mobile-open');
    overlay.classList.toggle('visible');
  });

  overlay.addEventListener('click', () => {
    sidebar.classList.remove('mobile-open');
    overlay.classList.remove('visible');
  });

  // Page navigation
  const navItems = document.querySelectorAll('.nav-item[data-page]');
  const pages = document.querySelectorAll('.page');
  const topbarTitle = document.getElementById('topbarTitle');

  const pageTitles = {
    stats:          '📊 Estatísticas',
    quests:         '🗡️ Pegar Quests',
    myquests:       '📜 Minhas Quests',
    ranking:        '🏆 Ranking',
    profile:        '⚙️ Perfil',
    submissions:    '📬 Revisões Pendentes',
    'quests-admin': '🗡️ Gerenciar Quests',
    users:          '👥 Usuários',
    'ranking-admin':'🏆 Rankings',
  };

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const page = item.dataset.page;

      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');

      pages.forEach(p => p.classList.remove('active'));
      const target = document.getElementById(`page-${page}`);
      if (target) target.classList.add('active');

      if (topbarTitle) topbarTitle.textContent = pageTitles[page] || page;

      // Fechar mobile sidebar
      sidebar.classList.remove('mobile-open');
      overlay.classList.remove('visible');

      // Carregar dados da página
      if (window.loadPage) window.loadPage(page);
    });
  });
});
