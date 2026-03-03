/* ================================================================
   AUTH.JS — Firebase Auth + Sidebar + Navegação
   ================================================================ */

// ─── Firebase config (mesmo do index.html) ───────────────────────
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain:        "marmota-rpg.firebaseapp.com",
  databaseURL:       "https://marmota-rpg-default-rtdb.firebaseio.com",
  projectId:         "marmota-rpg",
  storageBucket:     "marmota-rpg.appspot.com",
  messagingSenderId: "000000000000",
  appId:             "1:000000000000:web:xxxxxxxxxxxxxxxx"
};

// ─── Estado Global ───────────────────────────────────────────────
window.RPG = {
  user:     null,
  idToken:  null,
  auth:     null,

  // Retorna token sempre fresco (Firebase renova automaticamente)
  async getToken() {
    if (!this.auth?.currentUser) return null;
    return await this.auth.currentUser.getIdToken();
  },

  // Chamada autenticada para o backend
  async api(url, options = {}) {
    const token = await this.getToken();
    if (!token) { window.location.href = '/'; return null; }

    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
        ...(options.headers || {})
      }
    });

    if (res.status === 401) { window.location.href = '/'; return null; }
    return res;
  },

  // Upload de imagem (multipart — sem Content-Type manual)
  async uploadImage(url, formData) {
    const token = await this.getToken();
    if (!token) { window.location.href = '/'; return null; }
    return await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
  }
};

// ─── Toast ───────────────────────────────────────────────────────
window.showToast = (message, type = 'info', duration = 3500) => {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const icons = { success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration + 400);
};

// ─── Inicialização (carrega Firebase dinamicamente) ───────────────
async function initFirebaseAuth(requireAdmin = false) {
  const { initializeApp }     = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
  const { getAuth, onAuthStateChanged, signOut } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');

  const app  = initializeApp(FIREBASE_CONFIG, 'rpg-app');
  const auth = getAuth(app);
  RPG.auth   = auth;

  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        window.location.href = '/';
        return resolve(null);
      }

      try {
        const token = await firebaseUser.getIdToken();
        RPG.idToken = token;

        // Buscar dados do usuário no backend
        const res  = await fetch('/api/auth/me', {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
          // Usuário não existe no DB ainda — registrar
          await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
              username: firebaseUser.displayName || 'Adventurer',
              email:    firebaseUser.email || '',
              photoURL: firebaseUser.photoURL || '',
              provider: firebaseUser.providerData[0]?.providerId || 'google'
            })
          });
          const res2 = await fetch('/api/auth/me', { headers: { 'Authorization': `Bearer ${token}` }});
          RPG.user = await res2.json();
        } else {
          RPG.user = await res.json();
        }

        if (requireAdmin && RPG.user.role !== 'admin') {
          window.location.href = '/home.html';
          return resolve(null);
        }

        // Logout button
        document.querySelectorAll('.nav-logout').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.preventDefault();
            await signOut(auth);
            window.location.href = '/';
          });
        });

        resolve(RPG.user);
      } catch (err) {
        console.error('Auth init error:', err);
        window.location.href = '/';
        resolve(null);
      }
    });
  });
}

// ─── Verificar autenticação ───────────────────────────────────────
async function checkAuth(requireAdmin = false) {
  return await initFirebaseAuth(requireAdmin);
}

// ─── Sidebar + Navegação ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const sidebar      = document.getElementById('sidebar');
  const mainContent  = document.getElementById('mainContent');
  const sidebarToggle= document.getElementById('sidebarToggle');
  const mobileMenuBtn= document.getElementById('mobileMenuBtn');
  if (!sidebar) return;

  // Desktop toggle
  sidebarToggle?.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    mainContent?.classList.toggle('collapsed');
    localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed'));
  });
  if (localStorage.getItem('sidebarCollapsed') === 'true') {
    sidebar.classList.add('collapsed');
    mainContent?.classList.add('collapsed');
  }

  // Mobile overlay
  const overlay = document.createElement('div');
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

  // Navegação entre páginas
  const pageTitles = {
    stats:          '📊 Estatísticas',
    quests:         '🗡️ Pegar Quests',
    myquests:       '📜 Minhas Quests',
    ranking:        '🏆 Ranking',
    profile:        '⚙️ Perfil',
    submissions:    '📬 Revisões Pendentes',
    quests:         '🗡️ Gerenciar Quests',
    users:          '👥 Usuários',
    'ranking-admin':'🏆 Rankings',
  };

  document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const page = item.dataset.page;

      document.querySelectorAll('.nav-item[data-page]').forEach(n => n.classList.remove('active'));
      item.classList.add('active');

      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.getElementById(`page-${page}`)?.classList.add('active');

      const topbarTitle = document.getElementById('topbarTitle');
      if (topbarTitle) topbarTitle.textContent = pageTitles[page] || page;

      sidebar.classList.remove('mobile-open');
      overlay.classList.remove('visible');

      if (window.loadPage) window.loadPage(page);
    });
  });
});
