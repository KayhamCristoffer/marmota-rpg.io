# 🚀 Guia de Implementação de Melhorias - RPG Quests

## ✅ Melhorias Já Implementadas

### 1. Filtrar Ranking Diário/Semanal/Mensal (moedas > 0)
**Status:** ✅ Implementado

**Arquivos modificados:**
- `firebase/database.js` (linhas ~816 e ~1028)

**Mudanças:**
```javascript
// Em proc_getRanking (linha ~816)
// Filtrar usuários com moedas > 0 para períodos diário/semanal/mensal
const filtered = (period !== "total")
  ? entries.filter(e => (e[field] || 0) > 0)
  : entries;

const sorted = filtered
  .sort((a, b) => (b[field] || 0) - (a[field] || 0));

// Em listenRanking (linha ~1028)
// Filtrar usuários com moedas > 0 para períodos diário/semanal/mensal
const filtered = (period !== "total")
  ? rankData.filter(e => (e[field] || 0) > 0)
  : rankData;

const result = filtered
  .sort((a, b) => (b[field] || 0) - (a[field] || 0))
```

---

## 📋 Melhorias Pendentes (Passo a Passo)

### 2. Sistema de Backup Automático de Rankings

**Objetivo:** Salvar rankings antes de cada reset (diário, semanal, mensal)

**Implementação:**

#### Passo 1: Criar função de backup em `firebase/database.js`

Adicionar ANTES da função `proc_resetRanking` (linha ~837):

```javascript
/**
 * Cria backup do ranking atual antes do reset
 * @param {string} period - "daily", "weekly" ou "monthly"
 */
export async function proc_backupRanking(period) {
  const fieldMap = { 
    daily: "coinsDaily", 
    weekly: "coinsWeekly", 
    monthly: "coinsMonthly" 
  };
  const field = fieldMap[period];
  if (!field) throw new Error(`Período inválido: ${period}`);

  // Buscar ranking atual
  const ranking = await proc_getRanking(period, 0); // 0 = todos
  
  // Criar timestamp para o backup
  const timestamp = Date.now();
  const date = new Date(timestamp);
  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
  
  // Salvar backup no Firebase
  const backupPath = `rankingBackups/${period}/${dateStr}_${timestamp}`;
  const backupData = {
    period,
    timestamp,
    date: dateStr,
    ranking: ranking.slice(0, 50) // Top 50 para economizar espaço
  };
  
  await set(ref(db, backupPath), backupData);
  console.log(`✅ Backup do ranking ${period} salvo em ${backupPath}`);
  
  return backupPath;
}
```

#### Passo 2: Modificar função `proc_resetRanking`

Substituir a função existente (linha ~837):

```javascript
export async function proc_resetRanking(period) {
  const fieldMap = { daily:"coinsDaily", weekly:"coinsWeekly", monthly:"coinsMonthly" };
  const field    = fieldMap[period];
  if (!field) throw new Error(`Período inválido: ${period}`);

  // ✨ NOVO: Criar backup antes do reset
  try {
    await proc_backupRanking(period);
  } catch (err) {
    console.error(`Erro ao criar backup de ${period}:`, err);
    // Continua mesmo se o backup falhar
  }

  const snap    = await get(ref(db, "rankings"));
  const entries = snapToArray(snap);
  const updates = {};
  entries.forEach(e => { updates[`rankings/${e.id}/${field}`] = 0; });
  if (Object.keys(updates).length) await update(ref(db, "/"), updates);
  await set(ref(db, `meta/lastReset_${period}`), now());
  
  console.log(`✅ Reset de ranking ${period} concluído`);
}
```

#### Passo 3: Adicionar export no final do arquivo

Adicionar na seção de exports (linha ~1118):

```javascript
export const backupRanking      = proc_backupRanking;
```

#### Passo 4: Visualizar backups no admin.html

Adicionar nova seção no `admin.html` após a seção de Rankings:

```html
<!-- ═══ Backups de Rankings ═══ -->
<div class="admin-section">
  <h3><i class="fas fa-save"></i> Backups de Rankings</h3>
  
  <div class="filter-row">
    <button class="filter-btn active" data-backup-period="daily">
      <i class="fas fa-sun"></i> Diário
    </button>
    <button class="filter-btn" data-backup-period="weekly">
      <i class="fas fa-calendar-week"></i> Semanal
    </button>
    <button class="filter-btn" data-backup-period="monthly">
      <i class="fas fa-calendar-alt"></i> Mensal
    </button>
  </div>

  <div id="rankingBackupsList" class="submissions-list"></div>
</div>
```

#### Passo 5: Adicionar lógica no `js/admin.js`

Adicionar no final do arquivo:

```javascript
/* ════════════════════════════════════════════════════════════════
   RANKING BACKUPS
════════════════════════════════════════════════════════════════ */
let _currentBackupPeriod = "daily";

window.loadRankingBackups = async function(period = "daily") {
  _currentBackupPeriod = period;
  const container = document.getElementById("rankingBackupsList");
  if (!container) return;

  container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Carregando backups...</div>';

  try {
    const backupsSnap = await get(ref(db, `rankingBackups/${period}`));
    
    if (!backupsSnap.exists()) {
      container.innerHTML = '<div class="empty-state"><p>Nenhum backup encontrado para este período.</p></div>';
      return;
    }

    const backups = [];
    backupsSnap.forEach(snap => {
      backups.push({ id: snap.key, ...snap.val() });
    });

    backups.sort((a, b) => b.timestamp - a.timestamp);

    container.innerHTML = backups.map(backup => `
      <div class="backup-item">
        <div class="backup-header">
          <strong>📅 ${new Date(backup.timestamp).toLocaleString('pt-BR')}</strong>
          <span class="backup-period-badge">${period}</span>
        </div>
        <div class="backup-ranking">
          <strong>Top ${backup.ranking?.length || 0} jogadores:</strong>
          <ol style="margin: 8px 0; padding-left: 20px;">
            ${(backup.ranking || []).slice(0, 10).map(r => 
              `<li>${r.nickname || r.username} - ${r.coins} moedas</li>`
            ).join('')}
            ${backup.ranking?.length > 10 ? '<li>... e mais jogadores</li>' : ''}
          </ol>
        </div>
      </div>
    `).join('');

  } catch (err) {
    container.innerHTML = '<div class="empty-state"><p>Erro ao carregar backups.</p></div>';
    console.error(err);
  }
};

// Filtros de período para backups
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll('[data-backup-period]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-backup-period]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      window.loadRankingBackups(btn.dataset.backupPeriod);
    });
  });
});
```

#### Passo 6: Adicionar CSS no `css/style.css`

```css
/* Backups de Ranking */
.backup-item {
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 12px;
  padding: 1rem;
  margin-bottom: 1rem;
}

.backup-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.8rem;
  padding-bottom: 0.8rem;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}

.backup-period-badge {
  background: var(--gold);
  color: var(--bg-primary);
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
}

.backup-ranking {
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.backup-ranking ol {
  list-style: decimal;
  color: var(--text-primary);
}

.backup-ranking li {
  padding: 0.25rem 0;
}
```

---

### 3. Ranking por Nível (Total)

**Objetivo:** Adicionar aba de ranking por nível máximo

#### Passo 1: Modificar `home.html`

Adicionar novo botão de filtro na seção de ranking:

```html
<!-- Buscar por: <div class="filter-row"> -->
<div class="filter-row">
  <button class="filter-btn active" data-period="total">
    <i class="fas fa-trophy"></i> Total
  </button>
  <button class="filter-btn" data-period="daily">
    <i class="fas fa-sun"></i> Diário
  </button>
  <button class="filter-btn" data-period="weekly">
    <i class="fas fa-calendar-week"></i> Semanal
  </button>
  <button class="filter-btn" data-period="monthly">
    <i class="fas fa-calendar-alt"></i> Mensal
  </button>
  <!-- ✨ NOVO -->
  <button class="filter-btn" data-period="level">
    <i class="fas fa-star"></i> Nível
  </button>
</div>
```

#### Passo 2: Modificar `firebase/database.js`

Na função `proc_getRanking` (linha ~779), adicionar suporte para ranking por nível:

```javascript
export async function proc_getRanking(period = "total", limit = 100) {
  const [rankSnap, usersSnap] = await Promise.all([
    get(ref(db, "rankings")),
    get(ref(db, "users"))
  ]);

  let entries  = snapToArray(rankSnap);
  let usersArr = snapToArray(usersSnap);

  // Fallbacks... (manter código existente)

  const userMap = {};
  usersArr.forEach(u => { userMap[u.uid || u.id] = u; });

  // ✨ NOVO: Suporte para ranking por nível
  if (period === "level") {
    // Ordenar usuários por nível (não por moedas)
    const sorted = usersArr
      .filter(u => u.uid) // Apenas usuários válidos
      .sort((a, b) => {
        const levelDiff = (b.level || 1) - (a.level || 1);
        if (levelDiff !== 0) return levelDiff;
        // Desempate por XP
        return (b.xp || 0) - (a.xp || 0);
      });

    const sliced = (limit > 0) ? sorted.slice(0, limit) : sorted;

    return sliced.map((u, i) => {
      const rankEntry = entries.find(e => e.uid === u.uid) || {};
      return {
        uid: u.uid,
        position: i + 1,
        coins: rankEntry.coinsTotal || 0, // Moedas totais para exibição
        level: u.level || 1,
        xp: u.xp || 0,
        nickname: u.nickname || u.username || "Aventureiro",
        username: u.username || "Aventureiro",
        photoURL: u.photoURL || "",
        iconUrl: u.iconUrl || "",
        badges: u.badges || []
      };
    });
  }

  // Lógica existente para outros períodos (manter)
  const field = {
    total:   "coinsTotal",
    daily:   "coinsDaily",
    weekly:  "coinsWeekly",
    monthly: "coinsMonthly"
  }[period] || "coinsTotal";

  // ... resto do código existente
}
```

#### Passo 3: Modificar `js/ranking.js`

Adicionar suporte visual para ranking por nível:

```javascript
// Na função que renderiza os itens (linha ~71), modificar:
<span class="ranking-coins">
  ${period === 'level' 
    ? `<i class="fas fa-star" style="font-size:.8rem"></i> ${(r.xp||0).toLocaleString("pt-BR")} XP`
    : `<i class="fas fa-coins" style="font-size:.8rem"></i> ${(r.coins||0).toLocaleString("pt-BR")}`
  }
</span>

// E no pódio (linha ~120):
<span class="podium-coins">
  ${period === 'level'
    ? `<i class="fas fa-star" style="font-size:.7rem"></i> Nv.${user.level||1}`
    : `<i class="fas fa-coins" style="font-size:.7rem"></i> ${(user.coins||0).toLocaleString("pt-BR")}`
  }
</span>
```

#### Passo 4: Modificar `listenRanking` em `firebase/database.js`

Adicionar suporte para período "level":

```javascript
export function listenRanking(period = "total", callback) {
  const rankRef  = ref(db, "rankings");
  const usersRef = ref(db, "users");

  let rankData  = null;
  let usersData = null;

  // ✨ NOVO: Definir field para level
  const field = (period === "level") ? "level" : {
    total:   "coinsTotal",
    daily:   "coinsDaily",
    weekly:  "coinsWeekly",
    monthly: "coinsMonthly"
  }[period] || "coinsTotal";

  function _emit() {
    if (!rankData || !usersData) return;
    const userMap = {};
    usersData.forEach(u => { userMap[u.uid || u.id] = u; });

    // ✨ NOVO: Lógica especial para ranking por nível
    if (period === "level") {
      const result = usersData
        .filter(u => u.uid)
        .sort((a, b) => {
          const levelDiff = (b.level || 1) - (a.level || 1);
          if (levelDiff !== 0) return levelDiff;
          return (b.xp || 0) - (a.xp || 0);
        })
        .map((u, i) => {
          const rankEntry = rankData.find(e => e.uid === u.uid) || {};
          return {
            uid: u.uid,
            position: i + 1,
            coins: rankEntry.coinsTotal || 0,
            level: u.level || 1,
            xp: u.xp || 0,
            nickname: u.nickname || u.username || "Aventureiro",
            username: u.username || "Aventureiro",
            photoURL: u.photoURL || "",
            iconUrl: u.iconUrl || "",
            badges: u.badges || []
          };
        });
      callback(result);
      return;
    }

    // Lógica existente para outros períodos (manter)
    // ...
  }

  // ... resto do código existente
}
```

---

### 4. CRUD de Usuários no Admin

**Objetivo:** Permitir editar, resetar nível e moedas dos usuários

#### Passo 1: Adicionar seção no `admin.html`

```html
<!-- ═══ Gerenciar Usuários ═══ -->
<div class="admin-section">
  <h3><i class="fas fa-users"></i> Gerenciar Usuários</h3>
  
  <!-- Busca -->
  <div style="margin-bottom: 1rem;">
    <input type="text" id="userSearchInput" placeholder="🔍 Buscar usuário por nome ou email..." 
           style="width: 100%; padding: 0.75rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.3); color: #fff;">
  </div>

  <div id="usersManagementList" class="submissions-list"></div>
</div>
```

#### Passo 2: Criar funções no `firebase/database.js`

```javascript
/**
 * Atualizar dados de um usuário (ADMIN)
 */
export async function proc_updateUserData(uid, data) {
  if (!uid || !data) throw new Error("UID e dados são obrigatórios");
  
  const updates = {};
  const allowedFields = ['nickname', 'level', 'xp', 'coins', 'coinsDaily', 'coinsWeekly', 'coinsMonthly'];
  
  Object.keys(data).forEach(key => {
    if (allowedFields.includes(key) && data[key] !== undefined) {
      updates[`users/${uid}/${key}`] = data[key];
    }
  });

  if (Object.keys(updates).length === 0) {
    throw new Error("Nenhum campo válido para atualizar");
  }

  await update(ref(db, "/"), updates);
  
  // Atualizar ranking se moedas mudaram
  if (data.coins !== undefined || data.coinsDaily !== undefined || data.coinsWeekly !== undefined || data.coinsMonthly !== undefined) {
    await proc_updateRankingEntry(uid);
  }
  
  return { success: true };
}

/**
 * Resetar nível de um usuário
 */
export async function proc_resetUserLevel(uid) {
  await update(ref(db, `users/${uid}`), {
    level: 1,
    xp: 0
  });
  return { success: true };
}

/**
 * Resetar moedas de um usuário
 */
export async function proc_resetUserCoins(uid, type = "all") {
  const updates = {};
  
  if (type === "all" || type === "total") updates[`users/${uid}/coins`] = 0;
  if (type === "all" || type === "daily") updates[`users/${uid}/coinsDaily`] = 0;
  if (type === "all" || type === "weekly") updates[`users/${uid}/coinsWeekly`] = 0;
  if (type === "all" || type === "monthly") updates[`users/${uid}/coinsMonthly`] = 0;
  
  await update(ref(db, "/"), updates);
  
  // Atualizar ranking
  await proc_updateRankingEntry(uid);
  
  return { success: true };
}

// Adicionar aos exports
export const updateUserData = proc_updateUserData;
export const resetUserLevel = proc_resetUserLevel;
export const resetUserCoins = proc_resetUserCoins;
```

#### Passo 3: Adicionar lógica no `js/admin.js`

```javascript
/* ════════════════════════════════════════════════════════════════
   GERENCIAR USUÁRIOS
════════════════════════════════════════════════════════════════ */
window.loadUsersManagement = async function() {
  const container = document.getElementById("usersManagementList");
  if (!container) return;

  container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Carregando usuários...</div>';

  try {
    const usersSnap = await get(ref(db, "users"));
    
    if (!usersSnap.exists()) {
      container.innerHTML = '<div class="empty-state"><p>Nenhum usuário encontrado.</p></div>';
      return;
    }

    const users = [];
    usersSnap.forEach(snap => {
      users.push({ uid: snap.key, ...snap.val() });
    });

    users.sort((a, b) => (b.level || 1) - (a.level || 1));

    renderUsers(users);

  } catch (err) {
    container.innerHTML = '<div class="empty-state"><p>Erro ao carregar usuários.</p></div>';
    console.error(err);
  }
};

function renderUsers(users) {
  const container = document.getElementById("usersManagementList");
  
  container.innerHTML = users.map(user => `
    <div class="user-management-item">
      <div class="user-info">
        ${user.iconUrl 
          ? `<div class="user-avatar-emoji">${user.iconUrl}</div>`
          : `<img src="${user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.nickname||user.username||'?')}&background=1a1a2e&color=c9a84c`}" 
                 class="user-avatar" onerror="this.src='https://ui-avatars.com/api/?name=?&background=1a1a2e&color=c9a84c'">`
        }
        <div class="user-details">
          <strong>${user.nickname || user.username}</strong>
          <div class="user-meta">
            <span>Nv.${user.level || 1}</span>
            <span>${(user.xp || 0).toLocaleString('pt-BR')} XP</span>
            <span>${(user.coins || 0).toLocaleString('pt-BR')} moedas</span>
            <span>${user.role === 'admin' ? '👑 Admin' : '⚔️ Usuário'}</span>
          </div>
        </div>
      </div>
      <div class="user-actions">
        <button class="btn-edit-user" data-uid="${user.uid}" title="Editar usuário">
          <i class="fas fa-edit"></i> Editar
        </button>
        <button class="btn-reset-level" data-uid="${user.uid}" title="Resetar nível">
          <i class="fas fa-star"></i> Reset Nv
        </button>
        <button class="btn-reset-coins" data-uid="${user.uid}" title="Resetar moedas">
          <i class="fas fa-coins"></i> Reset $
        </button>
      </div>
    </div>
  `).join('');

  // Event listeners
  container.querySelectorAll('.btn-edit-user').forEach(btn => {
    btn.addEventListener('click', () => openEditUserModal(btn.dataset.uid));
  });

  container.querySelectorAll('.btn-reset-level').forEach(btn => {
    btn.addEventListener('click', () => confirmResetUserLevel(btn.dataset.uid));
  });

  container.querySelectorAll('.btn-reset-coins').forEach(btn => {
    btn.addEventListener('click', () => confirmResetUserCoins(btn.dataset.uid));
  });
}

async function openEditUserModal(uid) {
  // Implementar modal de edição
  const userSnap = await get(ref(db, `users/${uid}`));
  const user = userSnap.val();
  
  // Criar modal com formulário
  // ... (implementar UI do modal)
}

async function confirmResetUserLevel(uid) {
  if (!confirm("Tem certeza que deseja resetar o nível deste usuário para 1?")) return;
  
  try {
    await resetUserLevel(uid);
    showToast("Nível resetado com sucesso!", "success");
    await loadUsersManagement();
  } catch (err) {
    showToast("Erro ao resetar nível: " + err.message, "error");
  }
}

async function confirmResetUserCoins(uid) {
  const type = prompt("Digite o tipo de reset:\n- 'all' (todas as moedas)\n- 'daily' (diárias)\n- 'weekly' (semanais)\n- 'monthly' (mensais)", "all");
  if (!type) return;
  
  try {
    await resetUserCoins(uid, type);
    showToast("Moedas resetadas com sucesso!", "success");
    await loadUsersManagement();
  } catch (err) {
    showToast("Erro ao resetar moedas: " + err.message, "error");
  }
}

// Busca de usuários
document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("userSearchInput");
  if (searchInput) {
    searchInput.addEventListener("input", async (e) => {
      const query = e.target.value.toLowerCase().trim();
      
      if (!query) {
        await loadUsersManagement();
        return;
      }

      const usersSnap = await get(ref(db, "users"));
      const users = [];
      usersSnap.forEach(snap => {
        const user = { uid: snap.key, ...snap.val() };
        if (
          (user.nickname && user.nickname.toLowerCase().includes(query)) ||
          (user.username && user.username.toLowerCase().includes(query)) ||
          (user.email && user.email.toLowerCase().includes(query))
        ) {
          users.push(user);
        }
      });

      users.sort((a, b) => (b.level || 1) - (a.level || 1));
      renderUsers(users);
    });
  }
});
```

---

### 5. Corrigir "Moedas de Hoje"

**Problema:** O valor de "Moedas de Hoje" está errado

**Solução:** Verificar se `coinsDaily` está sendo calculado corretamente

No `firebase/database.js`, a função `getUserStats` já retorna `coinsDaily` do banco. O problema pode estar na exibição ou no reset não estar zerando corretamente.

**Verificar em `js/home.js` (linha ~86):**

```javascript
// Certifique-se que está usando data.coinsDaily (não data.coins)
_set("coinsDaily", el => el.textContent = (data.coinsDaily || 0).toLocaleString("pt-BR"));
```

Se o problema persistir, verificar se o reset diário está sendo executado corretamente.

---

### 6. Busca em Minhas Quests

**Objetivo:** Adicionar campo de busca por nome da quest

#### Em `home.html`, adicionar antes do `<div id="myQuestsList">`:

```html
<div style="margin-bottom: 1rem;">
  <input type="text" id="myQuestsSearchInput" placeholder="🔍 Buscar quest por nome..." 
         style="width: 100%; padding: 0.75rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.3); color: #fff;">
</div>
```

#### Em `js/quests.js`, modificar `window.loadMyQuests`:

```javascript
window.loadMyQuests = function loadMyQuestsFunc(filter = "all") {
  // ... código existente ...
  
  // Aplicar filtro de busca se existir
  const searchInput = document.getElementById("myQuestsSearchInput");
  if (searchInput) {
    const query = searchInput.value.toLowerCase().trim();
    if (query) {
      filtered = filtered.filter(q => 
        (q.questTitle && q.questTitle.toLowerCase().includes(query))
      );
    }
  }
  
  // ... resto do código
};

// Adicionar event listener para busca
document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("myQuestsSearchInput");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      const activeFilter = document.querySelector("#page-myquests .filter-btn.active")?.dataset.filter || "all";
      window.loadMyQuests(activeFilter);
    });
  }
});
```

---

### 7 e 8. Busca em Gerenciar Quests e Conquistas (Admin)

#### Em `admin.html`, adicionar campos de busca:

```html
<!-- Em Gerenciar Quests -->
<div style="margin-bottom: 1rem;">
  <input type="text" id="adminQuestsSearchInput" placeholder="🔍 Buscar quest por nome..." 
         style="width: 100%; padding: 0.75rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.3); color: #fff;">
</div>

<!-- Em Gerenciar Conquistas -->
<div style="margin-bottom: 1rem;">
  <input type="text" id="adminAchievementsSearchInput" placeholder="🔍 Buscar conquista por nome..." 
         style="width: 100%; padding: 0.75rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.3); color: #fff;">
</div>
```

#### Em `js/admin.js`, adicionar filtros de busca:

```javascript
// Para Quests
document.addEventListener("DOMContentLoaded", () => {
  const questSearchInput = document.getElementById("adminQuestsSearchInput");
  if (questSearchInput) {
    questSearchInput.addEventListener("input", (e) => {
      const query = e.target.value.toLowerCase().trim();
      const items = document.querySelectorAll(".quest-item");
      
      items.forEach(item => {
        const title = item.querySelector(".quest-title")?.textContent.toLowerCase() || "";
        item.style.display = title.includes(query) ? "" : "none";
      });
    });
  }

  // Para Conquistas
  const achievementSearchInput = document.getElementById("adminAchievementsSearchInput");
  if (achievementSearchInput) {
    achievementSearchInput.addEventListener("input", (e) => {
      const query = e.target.value.toLowerCase().trim();
      const items = document.querySelectorAll(".achievement-item");
      
      items.forEach(item => {
        const name = item.querySelector(".achievement-name")?.textContent.toLowerCase() || "";
        item.style.display = name.includes(query) ? "" : "none";
      });
    });
  }
});
```

---

## 📝 CSS Adicional Necessário

Adicionar em `css/style.css`:

```css
/* User Management */
.user-management-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 12px;
  padding: 1rem;
  margin-bottom: 0.75rem;
}

.user-info {
  display: flex;
  gap: 1rem;
  align-items: center;
  flex: 1;
}

.user-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
}

.user-avatar-emoji {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(201,168,76,0.1);
  border: 2px solid var(--gold);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
}

.user-details {
  flex: 1;
}

.user-meta {
  display: flex;
  gap: 1rem;
  font-size: 0.85rem;
  color: var(--text-secondary);
  margin-top: 0.25rem;
}

.user-actions {
  display: flex;
  gap: 0.5rem;
}

.user-actions button {
  padding: 0.5rem 1rem;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.05);
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.2s;
  font-size: 0.85rem;
}

.user-actions button:hover {
  background: rgba(255,255,255,0.1);
  transform: translateY(-1px);
}

.btn-edit-user { color: var(--blue) !important; }
.btn-reset-level { color: var(--purple-light) !important; }
.btn-reset-coins { color: var(--gold) !important; }
```

---

## 🎯 Resumo das Alterações

| #  | Melhoria | Status | Arquivos Afetados |
|----|----------|--------|-------------------|
| 1  | Filtrar ranking (moedas > 0) | ✅ Implementado | `firebase/database.js` |
| 2  | Backup automático de rankings | 📋 Guia completo | `firebase/database.js`, `admin.html`, `js/admin.js`, `css/style.css` |
| 3  | Ranking por nível | 📋 Guia completo | `firebase/database.js`, `home.html`, `js/ranking.js` |
| 4  | CRUD de usuários | 📋 Guia completo | `firebase/database.js`, `admin.html`, `js/admin.js`, `css/style.css` |
| 5  | Corrigir "Moedas de Hoje" | 📋 Verificação | `js/home.js` |
| 6  | Busca em Minhas Quests | 📋 Guia completo | `home.html`, `js/quests.js` |
| 7  | Busca em Gerenciar Quests | 📋 Guia completo | `admin.html`, `js/admin.js` |
| 8  | Busca em Gerenciar Conquistas | 📋 Guia completo | `admin.html`, `js/admin.js` |

---

## ✅ Como Implementar

1. **Abra cada arquivo mencionado**
2. **Encontre as linhas indicadas** (use Ctrl+G no VS Code)
3. **Adicione ou substitua o código** conforme o guia
4. **Teste cada funcionalidade** individualmente
5. **Faça commit das mudanças**

**Tempo estimado:** 2-3 horas para implementar todas as melhorias

---

## 🐛 Troubleshooting

Se algo não funcionar:

1. Verifique o console do navegador (F12)
2. Confirme que todos os imports estão corretos
3. Limpe o cache do navegador (Ctrl+Shift+Delete)
4. Verifique se o Firebase está respondendo

---

**Criado em:** 2026-03-27  
**Versão:** 1.0  
**Projeto:** RPG Quests
