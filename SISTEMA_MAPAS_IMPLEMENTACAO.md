# 🗺️ Sistema de Mapas - Guia Completo de Implementação

## 📋 Visão Geral

Sistema completo para que usuários possam:
- Enviar mapas personalizados
- Receber moedas + Tokens (nova moeda)
- Ter mapas aprovados por admin
- Ver mapas na seção "Regiões" (ranking por likes)
- Editar mapas (requer nova aprovação)
- Curtir/favoritar mapas de outros usuários

---

## 🗄️ Estrutura de Dados no Firebase

### 1. Nova coleção `maps`

```javascript
maps/
  {mapId}/
    id: string             // ID único do mapa
    title: string          // Título do mapa
    description: string    // Descrição/apresentação
    topics: array          // Tópicos relacionados
    authorUid: string      // UID do criador
    authorName: string     // Nome do criador
    
    // Arquivos
    driveLink: string      // Link do Drive com arquivos do mapa
    screenshots: array     // URLs dos prints de preview
    downloadUrl: string    // Link direto para download
    
    // Status e aprovação
    status: string         // "pending", "approved", "rejected", "editing"
    approvedBy: string     // UID do admin que aprovou
    approvedAt: number     // Timestamp de aprovação
    rejectionReason: string // Motivo da rejeição
    
    // Recompensas
    coinsReward: number    // Moedas ganhas (definido pelo admin)
    tokensReward: number   // Tokens ganhos (definido pelo admin)
    rewardClaimed: boolean // Se já recebeu recompensa
    
    // Engajamento
    likes: number          // Total de likes
    favorites: number      // Total de favoritos
    downloads: number      // Total de downloads
    views: number          // Total de visualizações
    
    // Timestamps
    created_at: number
    updated_at: number
    lastEditedAt: number
```

### 2. Nova coleção `mapLikes`

```javascript
mapLikes/
  {mapId}/
    {uid}: boolean       // true = liked
```

### 3. Nova coleção `mapFavorites`

```javascript
mapFavorites/
  {uid}/
    {mapId}: {
      addedAt: number
      mapTitle: string
    }
```

### 4. Atualização em `users`

```javascript
users/{uid}/
  tokens: number         // ✨ NOVA moeda
  mapsSubmitted: number  // Total de mapas enviados
  mapsApproved: number   // Total de mapas aprovados
  // ... campos existentes
```

### 5. Nova coleção `mapExamples`

```javascript
mapExamples/
  {exampleId}/
    title: string
    description: string
    downloadUrl: string
    previewImage: string
    created_at: number
```

---

## 🔧 Implementação Backend

### Arquivo: `firebase/database.js`

Adicionar no final do arquivo, antes dos exports:

```javascript
/* ════════════════════════════════════════════════════════════════
   §11  MAPS SYSTEM
════════════════════════════════════════════════════════════════ */

/**
 * Submeter novo mapa para aprovação
 */
export async function proc_submitMap(uid, mapData) {
  if (!uid || !mapData) throw new Error("UID e dados do mapa são obrigatórios");
  
  const user = await proc_getUser(uid);
  if (!user) throw new Error("Usuário não encontrado");

  // Validações
  if (!mapData.title || mapData.title.length < 3) {
    throw new Error("Título deve ter pelo menos 3 caracteres");
  }
  if (!mapData.description || mapData.description.length < 20) {
    throw new Error("Descrição deve ter pelo menos 20 caracteres");
  }
  if (!mapData.driveLink) {
    throw new Error("Link do Drive é obrigatório");
  }
  if (!mapData.screenshots || mapData.screenshots.length === 0) {
    throw new Error("Adicione pelo menos 1 print de preview");
  }

  const mapRef = push(ref(db, "maps"));
  const mapId = mapRef.key;

  const newMap = {
    id: mapId,
    title: mapData.title.trim(),
    description: mapData.description.trim(),
    topics: mapData.topics || [],
    authorUid: uid,
    authorName: user.nickname || user.username || "Aventureiro",
    
    driveLink: mapData.driveLink.trim(),
    screenshots: mapData.screenshots,
    downloadUrl: mapData.downloadUrl || mapData.driveLink,
    
    status: "pending",
    approvedBy: null,
    approvedAt: null,
    rejectionReason: null,
    
    coinsReward: 0,
    tokensReward: 0,
    rewardClaimed: false,
    
    likes: 0,
    favorites: 0,
    downloads: 0,
    views: 0,
    
    created_at: now(),
    updated_at: now(),
    lastEditedAt: null
  };

  await set(mapRef, newMap);
  
  // Atualizar contador do usuário
  await update(ref(db, `users/${uid}`), {
    mapsSubmitted: (user.mapsSubmitted || 0) + 1
  });

  return { id: mapId, ...newMap };
}

/**
 * Editar mapa existente (requer nova aprovação)
 */
export async function proc_editMap(uid, mapId, updates) {
  const mapSnap = await get(ref(db, `maps/${mapId}`));
  if (!mapSnap.exists()) throw new Error("Mapa não encontrado");
  
  const map = mapSnap.val();
  if (map.authorUid !== uid) throw new Error("Você não pode editar este mapa");

  // Validações similares ao submitMap
  if (updates.title && updates.title.length < 3) {
    throw new Error("Título deve ter pelo menos 3 caracteres");
  }
  if (updates.description && updates.description.length < 20) {
    throw new Error("Descrição deve ter pelo menos 20 caracteres");
  }

  const updatedData = {
    ...updates,
    status: "pending", // Volta para aprovação
    approvedBy: null,
    approvedAt: null,
    rejectionReason: null,
    updated_at: now(),
    lastEditedAt: now()
  };

  await update(ref(db, `maps/${mapId}`), updatedData);
  return { id: mapId, ...map, ...updatedData };
}

/**
 * Aprovar mapa (ADMIN)
 */
export async function proc_approveMap(mapId, adminUid, rewards = {}) {
  const mapSnap = await get(ref(db, `maps/${mapId}`));
  if (!mapSnap.exists()) throw new Error("Mapa não encontrado");
  
  const map = mapSnap.val();
  const coinsReward = rewards.coins || 50;  // Padrão: 50 moedas
  const tokensReward = rewards.tokens || 10; // Padrão: 10 tokens

  // Atualizar mapa
  await update(ref(db, `maps/${mapId}`), {
    status: "approved",
    approvedBy: adminUid,
    approvedAt: now(),
    rejectionReason: null,
    coinsReward,
    tokensReward
  });

  // Dar recompensa ao autor (se ainda não recebeu)
  if (!map.rewardClaimed) {
    const author = await proc_getUser(map.authorUid);
    const newCoins = (author.coins || 0) + coinsReward;
    const newTokens = (author.tokens || 0) + tokensReward;

    await update(ref(db, `users/${map.authorUid}`), {
      coins: newCoins,
      tokens: newTokens,
      mapsApproved: (author.mapsApproved || 0) + 1
    });

    await update(ref(db, `maps/${mapId}`), {
      rewardClaimed: true
    });

    // Atualizar ranking
    await proc_updateRankingEntry(map.authorUid);
  }

  return { success: true, coinsReward, tokensReward };
}

/**
 * Rejeitar mapa (ADMIN)
 */
export async function proc_rejectMap(mapId, adminUid, reason) {
  const mapSnap = await get(ref(db, `maps/${mapId}`));
  if (!mapSnap.exists()) throw new Error("Mapa não encontrado");

  await update(ref(db, `maps/${mapId}`), {
    status: "rejected",
    approvedBy: adminUid,
    approvedAt: now(),
    rejectionReason: reason || "Mapa não atende aos requisitos"
  });

  return { success: true };
}

/**
 * Listar mapas aprovados (Regiões)
 */
export async function proc_getApprovedMaps() {
  const mapsSnap = await get(ref(db, "maps"));
  if (!mapsSnap.exists()) return [];

  let maps = snapToArray(mapsSnap);
  
  // Filtrar apenas aprovados
  maps = maps.filter(m => m.status === "approved");
  
  // Ordenar por likes (mais curtidos primeiro)
  maps.sort((a, b) => (b.likes || 0) - (a.likes || 0));

  return maps;
}

/**
 * Listar mapas pendentes (ADMIN)
 */
export async function proc_getPendingMaps() {
  const mapsSnap = await get(ref(db, "maps"));
  if (!mapsSnap.exists()) return [];

  let maps = snapToArray(mapsSnap);
  maps = maps.filter(m => m.status === "pending");
  maps.sort((a, b) => b.created_at - a.created_at);

  return maps;
}

/**
 * Listar meus mapas (usuário)
 */
export async function proc_getMyMaps(uid) {
  const mapsSnap = await get(ref(db, "maps"));
  if (!mapsSnap.exists()) return [];

  let maps = snapToArray(mapsSnap);
  maps = maps.filter(m => m.authorUid === uid);
  maps.sort((a, b) => b.created_at - a.created_at);

  return maps;
}

/**
 * Curtir mapa
 */
export async function proc_likeMap(mapId, uid) {
  const likeRef = ref(db, `mapLikes/${mapId}/${uid}`);
  const likeSnap = await get(likeRef);

  if (likeSnap.exists()) {
    // Já curtiu - remover like
    await remove(likeRef);
    await update(ref(db, `maps/${mapId}`), {
      likes: increment(-1)
    });
    return { liked: false };
  } else {
    // Adicionar like
    await set(likeRef, true);
    await update(ref(db, `maps/${mapId}`), {
      likes: increment(1)
    });
    return { liked: true };
  }
}

/**
 * Favoritar mapa
 */
export async function proc_favoriteMap(mapId, uid) {
  const mapSnap = await get(ref(db, `maps/${mapId}`));
  if (!mapSnap.exists()) throw new Error("Mapa não encontrado");
  
  const map = mapSnap.val();
  const favRef = ref(db, `mapFavorites/${uid}/${mapId}`);
  const favSnap = await get(favRef);

  if (favSnap.exists()) {
    // Já favoritou - remover
    await remove(favRef);
    await update(ref(db, `maps/${mapId}`), {
      favorites: increment(-1)
    });
    return { favorited: false };
  } else {
    // Adicionar aos favoritos
    await set(favRef, {
      addedAt: now(),
      mapTitle: map.title
    });
    await update(ref(db, `maps/${mapId}`), {
      favorites: increment(1)
    });
    return { favorited: true };
  }
}

/**
 * Incrementar contador de downloads
 */
export async function proc_incrementMapDownload(mapId) {
  await update(ref(db, `maps/${mapId}`), {
    downloads: increment(1)
  });
}

/**
 * Incrementar contador de visualizações
 */
export async function proc_incrementMapView(mapId) {
  await update(ref(db, `maps/${mapId}`), {
    views: increment(1)
  });
}

/**
 * Verificar se usuário curtiu um mapa
 */
export async function proc_checkUserLike(mapId, uid) {
  const likeSnap = await get(ref(db, `mapLikes/${mapId}/${uid}`));
  return likeSnap.exists();
}

/**
 * Verificar se usuário favoritou um mapa
 */
export async function proc_checkUserFavorite(mapId, uid) {
  const favSnap = await get(ref(db, `mapFavorites/${uid}/${mapId}`));
  return favSnap.exists();
}

/**
 * Obter detalhes de um mapa
 */
export async function proc_getMapDetails(mapId, viewerUid = null) {
  const mapSnap = await get(ref(db, `maps/${mapId}`));
  if (!mapSnap.exists()) throw new Error("Mapa não encontrado");
  
  const map = mapSnap.val();
  
  // Incrementar visualização
  await proc_incrementMapView(mapId);
  
  // Se houver um usuário visualizando, verificar likes/favoritos
  if (viewerUid) {
    const [liked, favorited] = await Promise.all([
      proc_checkUserLike(mapId, viewerUid),
      proc_checkUserFavorite(mapId, viewerUid)
    ]);
    
    return { ...map, userLiked: liked, userFavorited: favorited };
  }
  
  return map;
}

/**
 * Adicionar mapa exemplo (ADMIN)
 */
export async function proc_addMapExample(exampleData) {
  const exampleRef = push(ref(db, "mapExamples"));
  const example = {
    id: exampleRef.key,
    title: exampleData.title,
    description: exampleData.description,
    downloadUrl: exampleData.downloadUrl,
    previewImage: exampleData.previewImage,
    created_at: now()
  };
  
  await set(exampleRef, example);
  return example;
}

/**
 * Listar mapas exemplo
 */
export async function proc_getMapExamples() {
  const snap = await get(ref(db, "mapExamples"));
  if (!snap.exists()) return [];
  
  return snapToArray(snap);
}

// Adicionar aos exports no final do arquivo
export const submitMap            = proc_submitMap;
export const editMap              = proc_editMap;
export const approveMap           = proc_approveMap;
export const rejectMap            = proc_rejectMap;
export const getApprovedMaps      = proc_getApprovedMaps;
export const getPendingMaps       = proc_getPendingMaps;
export const getMyMaps            = proc_getMyMaps;
export const likeMap              = proc_likeMap;
export const favoriteMap          = proc_favoriteMap;
export const incrementMapDownload = proc_incrementMapDownload;
export const getMapDetails        = proc_getMapDetails;
export const addMapExample        = proc_addMapExample;
export const getMapExamples       = proc_getMapExamples;
```

---

## 🎨 Interface de Usuário

### 1. Adicionar Menu em `home.html`

No menu de navegação, adicionar:

```html
<nav class="main-nav">
  <!-- Itens existentes -->
  <a href="#" class="nav-item" data-page="stats">
    <i class="fas fa-chart-bar"></i>
    <span>Estatísticas</span>
  </a>
  <a href="#" class="nav-item" data-page="quests">
    <i class="fas fa-scroll"></i>
    <span>Pegar Quests</span>
  </a>
  <a href="#" class="nav-item" data-page="myquests">
    <i class="fas fa-tasks"></i>
    <span>Minhas Quests</span>
  </a>
  
  <!-- ✨ NOVO: Mapas -->
  <a href="#" class="nav-item" data-page="maps">
    <i class="fas fa-map"></i>
    <span>Mapas</span>
  </a>
  <!-- ✨ NOVO: Regiões (Ranking de Mapas) -->
  <a href="#" class="nav-item" data-page="regions">
    <i class="fas fa-globe-americas"></i>
    <span>Regiões</span>
  </a>
  
  <a href="#" class="nav-item" data-page="ranking">
    <i class="fas fa-trophy"></i>
    <span>Ranking</span>
  </a>
  <a href="#" class="nav-item" data-page="profile">
    <i class="fas fa-user-circle"></i>
    <span>Perfil</span>
  </a>
</nav>
```

### 2. Atualizar Sidebar para mostrar Tokens

No `home.html`, atualizar a sidebar:

```html
<div class="stat-group">
  <div class="stat-item">
    <i class="fas fa-coins"></i>
    <div>
      <span class="stat-value" id="sidebarCoins">0</span>
      <span class="stat-label">Moedas</span>
    </div>
  </div>
  <!-- ✨ NOVO: Tokens -->
  <div class="stat-item">
    <i class="fas fa-gem"></i>
    <div>
      <span class="stat-value" id="sidebarTokens">0</span>
      <span class="stat-label">Tokens</span>
    </div>
  </div>
</div>
```

### 3. Nova Página: Meus Mapas

Adicionar no `home.html`:

```html
<!-- ═══════════════════════════════════════════════════════════
     PÁGINA: MEUS MAPAS
═══════════════════════════════════════════════════════════ -->
<section id="page-maps" class="page-content" style="display:none">
  <div class="page-header">
    <h2><i class="fas fa-map"></i> Meus Mapas</h2>
    <button class="btn-icon" id="refreshMapsBtn" title="Atualizar">
      <i class="fas fa-sync-alt"></i>
    </button>
  </div>

  <!-- Botão Enviar Novo Mapa -->
  <div style="margin-bottom: 1.5rem;">
    <button class="btn-primary" id="openSubmitMapBtn" style="width: 100%;">
      <i class="fas fa-plus"></i> Enviar Novo Mapa
    </button>
  </div>

  <!-- Mapas Exemplo para Download -->
  <div class="info-banner" style="margin-bottom: 1.5rem;">
    <i class="fas fa-info-circle"></i>
    <div>
      <strong>Modelos de Mapa</strong>
      <p style="margin: 0.5rem 0 0">Baixe mapas exemplo para usar como base:</p>
      <div id="mapExamplesContainer" style="margin-top: 0.75rem;"></div>
    </div>
  </div>

  <!-- Filtros -->
  <div class="filter-row">
    <button class="filter-btn active" data-map-filter="all">
      <i class="fas fa-th"></i> Todos
    </button>
    <button class="filter-btn" data-map-filter="pending">
      <i class="fas fa-clock"></i> Pendentes
    </button>
    <button class="filter-btn" data-map-filter="approved">
      <i class="fas fa-check"></i> Aprovados
    </button>
    <button class="filter-btn" data-map-filter="rejected">
      <i class="fas fa-times"></i> Rejeitados
    </button>
  </div>

  <!-- Lista de Mapas -->
  <div id="myMapsList"></div>
</section>
```

### 4. Nova Página: Regiões (Ranking de Mapas)

```html
<!-- ═══════════════════════════════════════════════════════════
     PÁGINA: REGIÕES (Ranking de Mapas)
═══════════════════════════════════════════════════════════ -->
<section id="page-regions" class="page-content" style="display:none">
  <div class="page-header">
    <h2><i class="fas fa-globe-americas"></i> Regiões</h2>
    <button class="btn-icon" id="refreshRegionsBtn" title="Atualizar">
      <i class="fas fa-sync-alt"></i>
    </button>
  </div>

  <div class="info-banner" style="margin-bottom: 1.5rem;">
    <i class="fas fa-heart"></i>
    <div>
      <strong>Mapas da Comunidade</strong>
      <p style="margin: 0">Explore mapas criados por outros jogadores. Curta e favorite seus preferidos!</p>
    </div>
  </div>

  <!-- Busca -->
  <div style="margin-bottom: 1rem;">
    <input type="text" id="regionsSearchInput" 
           placeholder="🔍 Buscar mapa por nome ou autor..." 
           style="width: 100%; padding: 0.75rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.3); color: #fff;">
  </div>

  <!-- Ordenação -->
  <div class="filter-row">
    <button class="filter-btn active" data-sort="likes">
      <i class="fas fa-heart"></i> Mais Curtidos
    </button>
    <button class="filter-btn" data-sort="recent">
      <i class="fas fa-clock"></i> Mais Recentes
    </button>
    <button class="filter-btn" data-sort="downloads">
      <i class="fas fa-download"></i> Mais Baixados
    </button>
  </div>

  <!-- Grid de Mapas -->
  <div id="regionsMapsList" class="maps-grid"></div>
</section>
```

### 5. Modal: Enviar Mapa

```html
<!-- ═══════════════════════════════════════════════════════════
     MODAL: ENVIAR MAPA
═══════════════════════════════════════════════════════════ -->
<div class="modal-overlay" id="submitMapModal">
  <div class="modal-box" style="max-width: 600px;">
    <button class="close-btn" id="closeSubmitMapModal">
      <i class="fas fa-times"></i>
    </button>

    <div class="modal-header">
      <span class="modal-icon">🗺️</span>
      <h2 id="submitMapTitle">Enviar Novo Mapa</h2>
      <p class="modal-subtitle">Compartilhe sua criação com a comunidade!</p>
    </div>

    <div class="modal-body">
      <div class="form-group">
        <label>
          <i class="fas fa-heading"></i> Título do Mapa *
        </label>
        <input type="text" id="mapTitle" placeholder="Ex: Vila dos Marmotas" maxlength="100">
        <div class="field-hint info" id="mapTitleHint">Mínimo 3 caracteres</div>
      </div>

      <div class="form-group">
        <label>
          <i class="fas fa-align-left"></i> Descrição/Apresentação *
        </label>
        <textarea id="mapDescription" rows="6" 
                  placeholder="Descreva seu mapa, como foi feito, o que contém, etc...&#10;&#10;Ex: Mapa completo da Vila dos Marmotas, incluindo:&#10;- Prefeitura&#10;- Casa dos personagens&#10;- Loja de itens&#10;- Arena de batalhas"
                  maxlength="2000"></textarea>
        <div class="field-hint info" id="mapDescHint">Mínimo 20 caracteres</div>
      </div>

      <div class="form-group">
        <label>
          <i class="fas fa-tags"></i> Tópicos/Tags
        </label>
        <input type="text" id="mapTopics" 
               placeholder="Ex: Vila, Cidade, PvP, Quest (separar por vírgula)">
        <div class="field-hint info">Opcional - ajuda outros jogadores a encontrar</div>
      </div>

      <div class="form-group">
        <label>
          <i class="fas fa-link"></i> Link do Google Drive *
        </label>
        <input type="url" id="mapDriveLink" 
               placeholder="https://drive.google.com/...">
        <div class="field-hint info">
          Cole o link público do Google Drive com os arquivos do mapa
        </div>
      </div>

      <div class="form-group">
        <label>
          <i class="fas fa-images"></i> Links dos Prints (Preview) *
        </label>
        <textarea id="mapScreenshots" rows="4"
                  placeholder="Cole os links das imagens (um por linha)&#10;https://i.imgur.com/exemplo1.png&#10;https://i.imgur.com/exemplo2.png"></textarea>
        <div class="field-hint info">
          Pelo menos 1 print. Use Imgur ou similar para hospedar
        </div>
      </div>

      <div class="rewards-preview" style="background: rgba(201,168,76,0.1); border: 1px solid rgba(201,168,76,0.3); border-radius: 12px; padding: 1rem; margin-top: 1.5rem;">
        <strong style="color: var(--gold); display: flex; align-items: center; gap: 0.5rem;">
          <i class="fas fa-gift"></i> Recompensa ao Aprovar
        </strong>
        <p style="margin: 0.5rem 0 0; font-size: 0.9rem; color: var(--text-secondary);">
          Ao ser aprovado pelo admin, você receberá moedas e tokens!
        </p>
      </div>
    </div>

    <div class="modal-footer">
      <button class="btn-secondary" id="cancelSubmitMapBtn">
        <i class="fas fa-times"></i> Cancelar
      </button>
      <button class="btn-primary" id="confirmSubmitMapBtn">
        <i class="fas fa-paper-plane"></i> Enviar para Aprovação
      </button>
    </div>
  </div>
</div>
```

### 6. Modal: Visualizar Mapa

```html
<!-- ═══════════════════════════════════════════════════════════
     MODAL: DETALHES DO MAPA
═══════════════════════════════════════════════════════════ -->
<div class="modal-overlay" id="mapDetailsModal">
  <div class="modal-box" style="max-width: 800px;">
    <button class="close-btn" id="closeMapDetailsModal">
      <i class="fas fa-times"></i>
    </button>

    <div id="mapDetailsContent">
      <!-- Conteúdo dinâmico -->
    </div>
  </div>
</div>
```

---

## 💻 Lógica JavaScript

### Arquivo: `js/maps.js` (NOVO)

Criar arquivo completo:

```javascript
/* ================================================================
   js/maps.js - Sistema de Mapas
================================================================ */

import "../firebase/session-manager.js";
import {
  submitMap, editMap, getMyMaps, getApprovedMaps, getMapDetails,
  likeMap, favoriteMap, incrementMapDownload, getMapExamples
} from "../firebase/database.js";

let _currentMapFilter = "all";
let _currentMapSort = "likes";
let _allMaps = [];
let _editingMapId = null;

/* ════════════════════════════════════════════════════════════════
   CARREGAR MEUS MAPAS
════════════════════════════════════════════════════════════════ */
window.loadMyMaps = async function(filter = "all") {
  _currentMapFilter = filter;
  const container = document.getElementById("myMapsList");
  if (!container) return;

  container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Carregando...</div>';

  try {
    const uid = window.RPG?.getFbUser()?.uid;
    if (!uid) return;

    const maps = await getMyMaps(uid);

    // Filtrar
    let filtered = maps;
    if (filter !== "all") {
      filtered = maps.filter(m => m.status === filter);
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-map"></i>
          <h3>Nenhum mapa ${filter !== 'all' ? filter : ''}</h3>
          <p>Envie seu primeiro mapa e ganhe recompensas!</p>
        </div>`;
      return;
    }

    container.innerHTML = filtered.map(renderMyMapCard).join('');

    // Event listeners
    container.querySelectorAll('.btn-edit-map').forEach(btn => {
      btn.addEventListener('click', () => openEditMapModal(btn.dataset.id));
    });

  } catch (err) {
    console.error('Erro ao carregar mapas:', err);
    container.innerHTML = '<div class="empty-state"><p>Erro ao carregar mapas.</p></div>';
  }
};

function renderMyMapCard(map) {
  const statusConfig = {
    pending: { label: "Pendente", css: "status-pending", icon: "⏳" },
    approved: { label: "Aprovado", css: "status-approved", icon: "✅" },
    rejected: { label: "Rejeitado", css: "status-rejected", icon: "❌" }
  };
  const status = statusConfig[map.status] || statusConfig.pending;

  return `
    <div class="map-card">
      <div class="map-preview">
        <img src="${map.screenshots[0] || 'https://via.placeholder.com/300x200?text=Sem+Preview'}" 
             alt="${escapeHtml(map.title)}"
             onerror="this.src='https://via.placeholder.com/300x200?text=Erro+na+Imagem'">
        <div class="map-status-badge ${status.css}">
          ${status.icon} ${status.label}
        </div>
      </div>

      <div class="map-info">
        <h3 class="map-title">${escapeHtml(map.title)}</h3>
        <p class="map-description">${escapeHtml(map.description).substring(0, 100)}...</p>

        <div class="map-stats">
          <span title="Curtidas"><i class="fas fa-heart"></i> ${map.likes || 0}</span>
          <span title="Downloads"><i class="fas fa-download"></i> ${map.downloads || 0}</span>
          <span title="Visualizações"><i class="fas fa-eye"></i> ${map.views || 0}</span>
        </div>

        ${map.status === 'approved' ? `
          <div class="map-rewards">
            <span class="reward-badge">
              <i class="fas fa-coins"></i> +${map.coinsReward} moedas
            </span>
            <span class="reward-badge">
              <i class="fas fa-gem"></i> +${map.tokensReward} tokens
            </span>
          </div>
        ` : ''}

        ${map.status === 'rejected' && map.rejectionReason ? `
          <div class="map-rejection">
            <i class="fas fa-exclamation-circle"></i>
            <strong>Motivo:</strong> ${escapeHtml(map.rejectionReason)}
          </div>
        ` : ''}

        <div class="map-actions">
          ${map.status !== 'approved' ? `
            <button class="btn-small btn-edit-map" data-id="${map.id}">
              <i class="fas fa-edit"></i> Editar
            </button>
          ` : ''}
          <a href="${map.driveLink}" target="_blank" class="btn-small">
            <i class="fas fa-external-link-alt"></i> Ver Drive
          </a>
        </div>
      </div>
    </div>
  `;
}

/* ════════════════════════════════════════════════════════════════
   CARREGAR REGIÕES (Mapas Aprovados)
════════════════════════════════════════════════════════════════ */
window.loadRegions = async function(sort = "likes") {
  _currentMapSort = sort;
  const container = document.getElementById("regionsMapsList");
  if (!container) return;

  container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Carregando mapas...</div>';

  try {
    let maps = await getApprovedMaps();
    _allMaps = maps;

    // Ordenar
    if (sort === "recent") {
      maps.sort((a, b) => b.created_at - a.created_at);
    } else if (sort === "downloads") {
      maps.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
    } else {
      maps.sort((a, b) => (b.likes || 0) - (a.likes || 0));
    }

    if (maps.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-globe-americas"></i>
          <h3>Nenhum mapa disponível ainda</h3>
          <p>Seja o primeiro a enviar um mapa!</p>
        </div>`;
      return;
    }

    renderRegionsMaps(maps);

  } catch (err) {
    console.error('Erro ao carregar regiões:', err);
    container.innerHTML = '<div class="empty-state"><p>Erro ao carregar mapas.</p></div>';
  }
};

function renderRegionsMaps(maps) {
  const container = document.getElementById("regionsMapsList");
  
  container.innerHTML = maps.map((map, index) => `
    <div class="region-map-card" data-map-id="${map.id}">
      <div class="region-rank">#${index + 1}</div>
      
      <div class="region-preview">
        <img src="${map.screenshots[0] || 'https://via.placeholder.com/300x200'}" 
             alt="${escapeHtml(map.title)}">
      </div>

      <div class="region-info">
        <h3 class="region-title">${escapeHtml(map.title)}</h3>
        <p class="region-author">Por ${escapeHtml(map.authorName)}</p>

        <div class="region-stats">
          <span class="stat-item">
            <i class="fas fa-heart"></i> ${map.likes || 0}
          </span>
          <span class="stat-item">
            <i class="fas fa-download"></i> ${map.downloads || 0}
          </span>
          <span class="stat-item">
            <i class="fas fa-eye"></i> ${map.views || 0}
          </span>
        </div>

        <div class="region-actions">
          <button class="btn-like" data-map-id="${map.id}">
            <i class="fas fa-heart"></i> Curtir
          </button>
          <button class="btn-view-map" data-map-id="${map.id}">
            <i class="fas fa-eye"></i> Ver Detalhes
          </button>
        </div>
      </div>
    </div>
  `).join('');

  // Event listeners
  container.querySelectorAll('.btn-like').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await handleLikeMap(btn.dataset.mapId);
    });
  });

  container.querySelectorAll('.btn-view-map').forEach(btn => {
    btn.addEventListener('click', () => {
      openMapDetailsModal(btn.dataset.mapId);
    });
  });
}

/* ════════════════════════════════════════════════════════════════
   AÇÕES
════════════════════════════════════════════════════════════════ */
async function handleLikeMap(mapId) {
  try {
    const uid = window.RPG?.getFbUser()?.uid;
    if (!uid) return;

    const result = await likeMap(mapId, uid);
    window.showToast?.(
      result.liked ? "❤️ Mapa curtido!" : "Curtida removida",
      result.liked ? "success" : "info"
    );

    // Recarregar
    await window.loadRegions?.(_currentMapSort);
  } catch (err) {
    window.showToast?.("Erro ao curtir mapa", "error");
  }
}

async function openMapDetailsModal(mapId) {
  const modal = document.getElementById("mapDetailsModal");
  const content = document.getElementById("mapDetailsContent");
  
  if (!modal || !content) return;

  content.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i></div>';
  modal.style.display = "flex";

  try {
    const uid = window.RPG?.getFbUser()?.uid;
    const map = await getMapDetails(mapId, uid);

    content.innerHTML = `
      <div class="map-details-header">
        <h2>${escapeHtml(map.title)}</h2>
        <p class="map-author">Por ${escapeHtml(map.authorName)}</p>
      </div>

      <div class="map-screenshots">
        ${map.screenshots.map(url => `
          <img src="${url}" alt="Screenshot" class="screenshot-img">
        `).join('')}
      </div>

      <div class="map-description-full">
        <h3><i class="fas fa-info-circle"></i> Descrição</h3>
        <p>${escapeHtml(map.description).replace(/\n/g, '<br>')}</p>
      </div>

      ${map.topics && map.topics.length > 0 ? `
        <div class="map-topics">
          <h3><i class="fas fa-tags"></i> Tags</h3>
          <div class="topics-list">
            ${map.topics.map(t => `<span class="topic-tag">${escapeHtml(t)}</span>`).join('')}
          </div>
        </div>
      ` : ''}

      <div class="map-stats-full">
        <div class="stat-box">
          <i class="fas fa-heart"></i>
          <strong>${map.likes || 0}</strong>
          <span>Curtidas</span>
        </div>
        <div class="stat-box">
          <i class="fas fa-download"></i>
          <strong>${map.downloads || 0}</strong>
          <span>Downloads</span>
        </div>
        <div class="stat-box">
          <i class="fas fa-eye"></i>
          <strong>${map.views || 0}</strong>
          <span>Views</span>
        </div>
      </div>

      <div class="map-actions-full">
        <button class="btn-primary btn-download-map" data-link="${map.driveLink}" data-id="${map.id}">
          <i class="fas fa-download"></i> Baixar Mapa
        </button>
        <button class="btn-secondary btn-like-modal ${map.userLiked ? 'liked' : ''}" data-id="${map.id}">
          <i class="fas fa-heart"></i> ${map.userLiked ? 'Curtido' : 'Curtir'}
        </button>
        <button class="btn-secondary btn-favorite-modal ${map.userFavorited ? 'favorited' : ''}" data-id="${map.id}">
          <i class="fas fa-star"></i> ${map.userFavorited ? 'Favoritado' : 'Favoritar'}
        </button>
      </div>
    `;

    // Event listeners
    content.querySelector('.btn-download-map')?.addEventListener('click', async (e) => {
      await incrementMapDownload(map.id);
      window.open(e.target.dataset.link, '_blank');
      window.showToast?.("Download iniciado! 📥", "success");
    });

    content.querySelector('.btn-like-modal')?.addEventListener('click', async () => {
      await handleLikeMap(map.id);
      openMapDetailsModal(map.id); // Recarregar
    });

    content.querySelector('.btn-favorite-modal')?.addEventListener('click', async () => {
      await handleFavoriteMap(map.id);
      openMapDetailsModal(map.id); // Recarregar
    });

  } catch (err) {
    content.innerHTML = '<div class="empty-state"><p>Erro ao carregar detalhes.</p></div>';
  }
}

async function handleFavoriteMap(mapId) {
  try {
    const uid = window.RPG?.getFbUser()?.uid;
    if (!uid) return;

    const result = await favoriteMap(mapId, uid);
    window.showToast?.(
      result.favorited ? "⭐ Adicionado aos favoritos!" : "Removido dos favoritos",
      result.favorited ? "success" : "info"
    );
  } catch (err) {
    window.showToast?.("Erro ao favoritar mapa", "error");
  }
}

/* ════════════════════════════════════════════════════════════════
   MODAL: ENVIAR/EDITAR MAPA
════════════════════════════════════════════════════════════════ */
function openSubmitMapModal() {
  const modal = document.getElementById("submitMapModal");
  if (!modal) return;

  _editingMapId = null;
  document.getElementById("submitMapTitle").textContent = "Enviar Novo Mapa";
  
  // Limpar campos
  document.getElementById("mapTitle").value = "";
  document.getElementById("mapDescription").value = "";
  document.getElementById("mapTopics").value = "";
  document.getElementById("mapDriveLink").value = "";
  document.getElementById("mapScreenshots").value = "";

  modal.style.display = "flex";
}

function openEditMapModal(mapId) {
  // Similar ao submitModal mas carrega dados do mapa
  // ... implementar
}

/* ════════════════════════════════════════════════════════════════
   EVENT LISTENERS
════════════════════════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", () => {
  // Botões de abrir modals
  document.getElementById("openSubmitMapBtn")?.addEventListener("click", openSubmitMapModal);
  document.getElementById("closeSubmitMapModal")?.addEventListener("click", () => {
    document.getElementById("submitMapModal").style.display = "none";
  });
  document.getElementById("cancelSubmitMapBtn")?.addEventListener("click", () => {
    document.getElementById("submitMapModal").style.display = "none";
  });

  // Enviar mapa
  document.getElementById("confirmSubmitMapBtn")?.addEventListener("click", async () => {
    const title = document.getElementById("mapTitle").value.trim();
    const description = document.getElementById("mapDescription").value.trim();
    const topicsStr = document.getElementById("mapTopics").value.trim();
    const driveLink = document.getElementById("mapDriveLink").value.trim();
    const screenshotsStr = document.getElementById("mapScreenshots").value.trim();

    // Validações
    if (!title || title.length < 3) {
      window.showToast?.("Título deve ter pelo menos 3 caracteres", "warning");
      return;
    }
    if (!description || description.length < 20) {
      window.showToast?.("Descrição deve ter pelo menos 20 caracteres", "warning");
      return;
    }
    if (!driveLink) {
      window.showToast?.("Link do Drive é obrigatório", "warning");
      return;
    }
    if (!screenshotsStr) {
      window.showToast?.("Adicione pelo menos 1 print de preview", "warning");
      return;
    }

    const topics = topicsStr ? topicsStr.split(',').map(t => t.trim()).filter(Boolean) : [];
    const screenshots = screenshotsStr.split('\n').map(s => s.trim()).filter(Boolean);

    try {
      const uid = window.RPG?.getFbUser()?.uid;
      const mapData = {
        title,
        description,
        topics,
        driveLink,
        screenshots
      };

      if (_editingMapId) {
        await editMap(uid, _editingMapId, mapData);
        window.showToast?.("✅ Mapa atualizado! Aguardando nova aprovação", "success");
      } else {
        await submitMap(uid, mapData);
        window.showToast?.("✅ Mapa enviado! Aguardando aprovação do admin", "success");
      }

      document.getElementById("submitMapModal").style.display = "none";
      await window.loadMyMaps?.(_currentMapFilter);

    } catch (err) {
      window.showToast?.(err.message || "Erro ao enviar mapa", "error");
    }
  });

  // Filtros de Meus Mapas
  document.querySelectorAll('[data-map-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-map-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      window.loadMyMaps?.(btn.dataset.mapFilter);
    });
  });

  // Ordenação de Regiões
  document.querySelectorAll('[data-sort]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-sort]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      window.loadRegions?.(btn.dataset.sort);
    });
  });

  // Busca em Regiões
  document.getElementById("regionsSearchInput")?.addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase().trim();
    
    if (!query) {
      renderRegionsMaps(_allMaps);
      return;
    }

    const filtered = _allMaps.filter(m =>
      m.title.toLowerCase().includes(query) ||
      m.authorName.toLowerCase().includes(query) ||
      (m.description && m.description.toLowerCase().includes(query))
    );

    renderRegionsMaps(filtered);
  });

  // Refresh
  document.getElementById("refreshMapsBtn")?.addEventListener("click", () => {
    window.loadMyMaps?.(_currentMapFilter);
  });

  document.getElementById("refreshRegionsBtn")?.addEventListener("click", () => {
    window.loadRegions?.(_currentMapSort);
  });
});

function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(String(text)));
  return div.innerHTML;
}
```

---

## 🎨 CSS Necessário

### Adicionar em `css/style.css`:

```css
/* ════════════════════════════════════════════════════════════════
   SISTEMA DE MAPAS
════════════════════════════════════════════════════════════════ */

/* Cards de Mapa */
.map-card {
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 16px;
  overflow: hidden;
  margin-bottom: 1rem;
  transition: all 0.3s;
}

.map-card:hover {
  transform: translateY(-4px);
  border-color: rgba(201,168,76,0.3);
  box-shadow: 0 8px 24px rgba(0,0,0,0.3);
}

.map-preview {
  position: relative;
  width: 100%;
  height: 200px;
  overflow: hidden;
}

.map-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.map-status-badge {
  position: absolute;
  top: 12px;
  right: 12px;
  padding: 0.4rem 0.8rem;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 600;
  backdrop-filter: blur(10px);
}

.status-pending {
  background: rgba(251,146,60,0.9);
  color: #fff;
}

.status-approved {
  background: rgba(74,222,128,0.9);
  color: #fff;
}

.status-rejected {
  background: rgba(248,113,113,0.9);
  color: #fff;
}

.map-info {
  padding: 1.25rem;
}

.map-title {
  font-family: 'Cinzel', serif;
  font-size: 1.1rem;
  color: var(--gold);
  margin: 0 0 0.5rem;
}

.map-description {
  font-size: 0.875rem;
  color: var(--text-secondary);
  line-height: 1.5;
  margin-bottom: 1rem;
}

.map-stats {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.map-stats span {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.map-rewards {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.reward-badge {
  background: rgba(201,168,76,0.15);
  border: 1px solid rgba(201,168,76,0.3);
  color: var(--gold);
  padding: 0.4rem 0.8rem;
  border-radius: 8px;
  font-size: 0.8rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.map-rejection {
  background: rgba(248,113,113,0.1);
  border: 1px solid rgba(248,113,113,0.3);
  border-radius: 8px;
  padding: 0.75rem;
  margin-bottom: 1rem;
  font-size: 0.85rem;
  color: #fca5a5;
}

.map-rejection strong {
  color: #f87171;
}

.map-actions {
  display: flex;
  gap: 0.5rem;
}

.btn-small {
  padding: 0.5rem 1rem;
  border-radius: 8px;
  font-size: 0.85rem;
  border: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.05);
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.2s;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.btn-small:hover {
  background: rgba(255,255,255,0.1);
  transform: translateY(-1px);
}

/* Grid de Regiões */
.maps-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.5rem;
}

.region-map-card {
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 16px;
  overflow: hidden;
  transition: all 0.3s;
  position: relative;
}

.region-map-card:hover {
  transform: translateY(-6px);
  border-color: rgba(201,168,76,0.4);
  box-shadow: 0 12px 30px rgba(0,0,0,0.4);
}

.region-rank {
  position: absolute;
  top: 12px;
  left: 12px;
  background: rgba(201,168,76,0.9);
  color: #0f0f1a;
  padding: 0.4rem 0.7rem;
  border-radius: 8px;
  font-weight: 700;
  font-size: 0.9rem;
  z-index: 1;
}

.region-preview {
  width: 100%;
  height: 180px;
  overflow: hidden;
}

.region-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s;
}

.region-map-card:hover .region-preview img {
  transform: scale(1.1);
}

.region-info {
  padding: 1.25rem;
}

.region-title {
  font-family: 'Cinzel', serif;
  font-size: 1rem;
  color: var(--gold);
  margin: 0 0 0.4rem;
}

.region-author {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-bottom: 1rem;
}

.region-stats {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
  font-size: 0.85rem;
}

.region-stats .stat-item {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--text-secondary);
}

.region-actions {
  display: flex;
  gap: 0.5rem;
}

.btn-like, .btn-view-map {
  flex: 1;
  padding: 0.6rem 1rem;
  border-radius: 8px;
  font-size: 0.85rem;
  border: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.05);
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
}

.btn-like:hover {
  background: rgba(248,113,113,0.2);
  border-color: rgba(248,113,113,0.4);
  color: #f87171;
}

.btn-view-map:hover {
  background: rgba(201,168,76,0.2);
  border-color: rgba(201,168,76,0.4);
  color: var(--gold);
}

/* Modal de Detalhes do Mapa */
.map-details-header {
  text-align: center;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid rgba(255,255,255,0.1);
  margin-bottom: 1.5rem;
}

.map-details-header h2 {
  font-family: 'Cinzel', serif;
  color: var(--gold);
  margin: 0 0 0.5rem;
}

.map-author {
  color: var(--text-muted);
  font-size: 0.9rem;
}

.map-screenshots {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.screenshot-img {
  width: 100%;
  height: 180px;
  object-fit: cover;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.1);
  cursor: pointer;
  transition: transform 0.3s;
}

.screenshot-img:hover {
  transform: scale(1.05);
}

.map-description-full,
.map-topics {
  margin-bottom: 1.5rem;
}

.map-description-full h3,
.map-topics h3 {
  font-size: 1rem;
  color: var(--gold);
  margin-bottom: 0.75rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.map-description-full p {
  line-height: 1.7;
  color: var(--text-secondary);
}

.topics-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.topic-tag {
  background: rgba(201,168,76,0.15);
  border: 1px solid rgba(201,168,76,0.3);
  color: var(--gold);
  padding: 0.4rem 0.8rem;
  border-radius: 16px;
  font-size: 0.8rem;
}

.map-stats-full {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.stat-box {
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 12px;
  padding: 1rem;
  text-align: center;
}

.stat-box i {
  font-size: 1.5rem;
  color: var(--gold);
  margin-bottom: 0.5rem;
  display: block;
}

.stat-box strong {
  display: block;
  font-size: 1.4rem;
  color: var(--text-primary);
  margin-bottom: 0.25rem;
}

.stat-box span {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.map-actions-full {
  display: flex;
  gap: 0.75rem;
}

.btn-download-map {
  flex: 2;
}

.btn-like-modal.liked,
.btn-favorite-modal.favorited {
  background: rgba(248,113,113,0.2);
  border-color: rgba(248,113,113,0.4);
  color: #f87171;
}

/* Responsivo */
@media (max-width: 768px) {
  .maps-grid {
    grid-template-columns: 1fr;
  }

  .map-stats-full {
    grid-template-columns: 1fr;
  }

  .map-screenshots {
    grid-template-columns: 1fr;
  }
}
```

---

## ⏱️ Timeout de Sessão (1 hora)

### Arquivo: `index.html`

Modificar a constante de duração da sessão (linha ~879):

```javascript
const SESSION_DURATION   = 60 * 60 * 1000; // ✨ ALTERADO: 1 hora (era 30 min)
```

### Arquivo: `firebase/session-manager.js`

Procurar e modificar:

```javascript
// De:
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutos

// Para:
const SESSION_TIMEOUT = 60 * 60 * 1000; // ✨ 1 hora
```

---

## 🛠️ Painel Admin

### Arquivo: `admin.html`

Adicionar nova seção:

```html
<!-- ═══ Gerenciar Mapas ═══ -->
<div class="admin-section">
  <h3><i class="fas fa-map"></i> Gerenciar Mapas</h3>
  
  <div class="filter-row">
    <button class="filter-btn active" data-map-admin-filter="pending">
      <i class="fas fa-clock"></i> Pendentes
    </button>
    <button class="filter-btn" data-map-admin-filter="approved">
      <i class="fas fa-check"></i> Aprovados
    </button>
    <button class="filter-btn" data-map-admin-filter="rejected">
      <i class="fas fa-times"></i> Rejeitados
    </button>
  </div>

  <div id="adminMapsList" class="submissions-list"></div>
</div>

<!-- ═══ Mapas Exemplo ═══ -->
<div class="admin-section">
  <h3><i class="fas fa-file-download"></i> Mapas Exemplo</h3>
  
  <button class="btn-primary" id="addMapExampleBtn" style="margin-bottom: 1rem;">
    <i class="fas fa-plus"></i> Adicionar Mapa Exemplo
  </button>

  <div id="mapExamplesList"></div>
</div>
```

### Arquivo: `js/admin.js`

Adicionar funções:

```javascript
/* ════════════════════════════════════════════════════════════════
   GERENCIAR MAPAS
════════════════════════════════════════════════════════════════ */
import { 
  getPendingMaps, approveMap, rejectMap, getApprovedMaps,
  addMapExample, getMapExamples
} from "../firebase/database.js";

window.loadAdminMaps = async function(filter = "pending") {
  const container = document.getElementById("adminMapsList");
  if (!container) return;

  container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Carregando...</div>';

  try {
    let maps;
    if (filter === "pending") {
      maps = await getPendingMaps();
    } else {
      const all = await getApprovedMaps();
      maps = filter === "approved" 
        ? all.filter(m => m.status === "approved")
        : all.filter(m => m.status === "rejected");
    }

    if (maps.length === 0) {
      container.innerHTML = `<div class="empty-state"><p>Nenhum mapa ${filter}</p></div>`;
      return;
    }

    container.innerHTML = maps.map(map => `
      <div class="submission-item">
        <div class="submission-header">
          <div>
            <strong>${map.title}</strong>
            <p style="margin: 0.25rem 0; color: var(--text-muted); font-size: 0.85rem;">
              Por ${map.authorName}
            </p>
          </div>
          <span class="submission-date">
            ${new Date(map.created_at).toLocaleDateString('pt-BR')}
          </span>
        </div>

        <div class="map-preview-admin">
          <img src="${map.screenshots[0]}" alt="Preview" style="max-width: 300px; border-radius: 8px;">
        </div>

        <p style="margin: 1rem 0; line-height: 1.6;">
          ${map.description.substring(0, 200)}...
        </p>

        <div class="submission-actions">
          <a href="${map.driveLink}" target="_blank" class="btn-secondary">
            <i class="fas fa-external-link-alt"></i> Ver Drive
          </a>
          
          ${filter === 'pending' ? `
            <button class="btn-approve-map" data-id="${map.id}">
              <i class="fas fa-check"></i> Aprovar
            </button>
            <button class="btn-reject-map" data-id="${map.id}">
              <i class="fas fa-times"></i> Rejeitar
            </button>
          ` : ''}
        </div>
      </div>
    `).join('');

    // Event listeners
    container.querySelectorAll('.btn-approve-map').forEach(btn => {
      btn.addEventListener('click', () => handleApproveMap(btn.dataset.id));
    });

    container.querySelectorAll('.btn-reject-map').forEach(btn => {
      btn.addEventListener('click', () => handleRejectMap(btn.dataset.id));
    });

  } catch (err) {
    container.innerHTML = '<div class="empty-state"><p>Erro ao carregar mapas.</p></div>';
    console.error(err);
  }
};

async function handleApproveMap(mapId) {
  const coins = prompt("Quantas MOEDAS dar de recompensa?", "50");
  if (coins === null) return;

  const tokens = prompt("Quantos TOKENS dar de recompensa?", "10");
  if (tokens === null) return;

  try {
    const adminUid = window.RPG?.getFbUser()?.uid;
    await approveMap(mapId, adminUid, {
      coins: parseInt(coins) || 50,
      tokens: parseInt(tokens) || 10
    });

    showToast("✅ Mapa aprovado! Recompensa concedida", "success");
    await loadAdminMaps("pending");
  } catch (err) {
    showToast("Erro ao aprovar mapa: " + err.message, "error");
  }
}

async function handleRejectMap(mapId) {
  const reason = prompt("Motivo da rejeição:");
  if (!reason) return;

  try {
    const adminUid = window.RPG?.getFbUser()?.uid;
    await rejectMap(mapId, adminUid, reason);

    showToast("❌ Mapa rejeitado", "success");
    await loadAdminMaps("pending");
  } catch (err) {
    showToast("Erro ao rejeitar mapa: " + err.message, "error");
  }
}

// Event listeners
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll('[data-map-admin-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-map-admin-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadAdminMaps(btn.dataset.mapAdminFilter);
    });
  });
});
```

---

## 📊 Atualizar Estatísticas do Usuário

### Arquivo: `js/home.js`

Adicionar exibição de tokens (linha ~64):

```javascript
// Depois de:
_set("sidebarCoins", el => el.textContent = (data.coins||0).toLocaleString("pt-BR"));

// Adicionar:
_set("sidebarTokens", el => el.textContent = (data.tokens||0).toLocaleString("pt-BR"));
_set("topbarTokens", el => el.textContent = (data.tokens||0).toLocaleString("pt-BR"));
```

---

## ✅ Checklist de Implementação

- [ ] Adicionar funções no `firebase/database.js`
- [ ] Criar arquivo `js/maps.js`
- [ ] Atualizar `home.html` (menu + páginas)
- [ ] Atualizar `admin.html` (gerenciamento)
- [ ] Adicionar CSS em `css/style.css`
- [ ] Atualizar timeout de sessão (1 hora)
- [ ] Testar envio de mapa
- [ ] Testar aprovação/rejeição
- [ ] Testar sistema de likes
- [ ] Testar ranking de regiões
- [ ] Commit e push

---

## 🎯 Tempo Estimado

**Total: 4-6 horas** para implementação completa

- Backend (database.js): 1-1.5h
- Frontend (HTML/JS): 2-3h
- CSS: 30min-1h
- Testes: 30min-1h

---

**Versão:** 1.0  
**Data:** 2026-03-27  
**Sistema:** RPG Quests - Mapas
