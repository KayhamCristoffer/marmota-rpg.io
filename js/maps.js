/* ================================================================
   js/maps.js - Sistema de Mapas  v2.0
   Fixes:
   - Screenshots como links clicáveis + proxy para imagens externas
   - handleLikeMap captura erros corretamente e usa referência local
   - openMapDetailsModal com UX melhorada
   - Todas as imagens externas (Google Drive, prnt.sc etc.) exibidas
     como botões de link (não como <img> que pode falhar CORS)
================================================================ */

import "../firebase/session-manager.js";
import {
  submitMap, editMap, getMyMaps, getApprovedMaps, getMapDetails,
  likeMap, favoriteMap, incrementMapDownload, getMapExamples
} from "../firebase/database.js";
import { get, ref } from "../firebase/services-config.js";
import { db } from "../firebase/services-config.js";

let _currentMapFilter = "all";
let _currentMapSort   = "likes";
let _allMaps          = [];
let _editingMapId     = null;

/* ── Helper: converter link do Google Drive para visualização direta ── */
function drivePreviewUrl(url) {
  if (!url) return null;
  // https://drive.google.com/file/d/FILE_ID/view  →  embed/preview
  const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w400`;
  // https://drive.google.com/open?id=FILE_ID
  const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2) return `https://drive.google.com/thumbnail?id=${m2[1]}&sz=w400`;
  return null;
}

/* ── Helper: retornar src seguro para screenshot ── */
function safeImgSrc(url) {
  if (!url) return null;
  if (url.startsWith("https://i.imgur.com") ||
      url.startsWith("https://imgur.com/") ||
      url.startsWith("https://ibb.co/") ||
      url.startsWith("https://i.ibb.co/")) {
    return url;
  }
  const drive = drivePreviewUrl(url);
  if (drive) return drive;
  // prnt.sc e outros — não renderizáveis diretamente; retornar null para exibir como link
  return null;
}

/* ── Helper: renderizar screenshot como imagem ou link ── */
function renderScreenshot(url, index = 0) {
  if (!url) return "";
  const src = safeImgSrc(url);
  if (src) {
    return `
      <a href="${url}" target="_blank" rel="noopener" title="Abrir imagem original">
        <img src="${src}" class="screenshot-img"
             alt="Screenshot ${index + 1}"
             onerror="this.parentElement.innerHTML=renderScreenshotLink('${escapeHtml(url)}', ${index})">
      </a>`;
  }
  return renderScreenshotLink(url, index);
}

function renderScreenshotLink(url, index = 0) {
  return `
    <a href="${url}" target="_blank" rel="noopener" class="screenshot-link-btn">
      <i class="fas fa-image"></i> Ver Print ${index + 1}
    </a>`;
}

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
    pending:  { label: "Pendente",  css: "status-pending",  icon: "⏳" },
    approved: { label: "Aprovado",  css: "status-approved", icon: "✅" },
    rejected: { label: "Rejeitado", css: "status-rejected", icon: "❌" }
  };
  const status = statusConfig[map.status] || statusConfig.pending;
  const screenshots = Array.isArray(map.screenshots) ? map.screenshots : [];
  const previewSrc  = screenshots.length ? safeImgSrc(screenshots[0]) : null;

  return `
    <div class="map-card">
      <div class="map-preview">
        ${previewSrc
          ? `<img src="${previewSrc}" alt="${escapeHtml(map.title)}"
                  onerror="this.style.display='none'">`
          : `<div class="map-preview-placeholder"><i class="fas fa-map"></i></div>`}
        <div class="map-status-badge ${status.css}">
          ${status.icon} ${status.label}
        </div>
      </div>

      <div class="map-info">
        <h3 class="map-title">${escapeHtml(map.title)}</h3>
        <p class="map-description">${escapeHtml(map.description || "").substring(0, 100)}...</p>

        <div class="map-stats">
          <span title="Curtidas"><i class="fas fa-heart"></i> ${map.likes || 0}</span>
          <span title="Downloads"><i class="fas fa-download"></i> ${map.downloads || 0}</span>
          <span title="Visualizações"><i class="fas fa-eye"></i> ${map.views || 0}</span>
        </div>

        ${map.status === 'approved' ? `
          <div class="map-rewards">
            <span class="reward-badge">
              <i class="fas fa-coins"></i> +${map.coinsReward || 0} moedas
            </span>
            <span class="reward-badge">
              <i class="fas fa-gem"></i> +${map.tokensReward || 0} tokens
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

    if (sort === "recent") {
      maps.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
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
  if (!container) return;

  container.innerHTML = maps.map((map, index) => {
    const screenshots = Array.isArray(map.screenshots) ? map.screenshots : [];
    const previewSrc  = screenshots.length ? safeImgSrc(screenshots[0]) : null;

    return `
      <div class="region-map-card" data-map-id="${map.id}">
        <div class="region-rank">#${index + 1}</div>

        <div class="region-preview">
          ${previewSrc
            ? `<img src="${previewSrc}" alt="${escapeHtml(map.title)}"
                    onerror="this.style.display='none'">`
            : `<div class="map-preview-placeholder"><i class="fas fa-map"></i></div>`}
        </div>

        <div class="region-info">
          <h3 class="region-title">${escapeHtml(map.title)}</h3>
          <p class="region-author">Por ${escapeHtml(map.authorName)}</p>

          <div class="region-stats">
            <span class="stat-item"><i class="fas fa-heart"></i> ${map.likes || 0}</span>
            <span class="stat-item"><i class="fas fa-download"></i> ${map.downloads || 0}</span>
            <span class="stat-item"><i class="fas fa-eye"></i> ${map.views || 0}</span>
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
      </div>`;
  }).join('');

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
    if (!uid) {
      window.showToast?.("Faça login para curtir mapas", "warning");
      return;
    }

    const result = await likeMap(mapId, uid);
    window.showToast?.(
      result.liked ? "❤️ Mapa curtido!" : "Curtida removida",
      result.liked ? "success" : "info"
    );

    // Recarregar lista atual
    await window.loadRegions(_currentMapSort);
  } catch (err) {
    console.error("Erro ao curtir mapa:", err);
    window.showToast?.("Erro ao curtir mapa: " + (err.message || ""), "error");
  }
}

async function openMapDetailsModal(mapId) {
  const modal   = document.getElementById("mapDetailsModal");
  const content = document.getElementById("mapDetailsContent");

  if (!modal || !content) return;

  content.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Carregando detalhes...</div>';
  modal.style.display = "flex";

  try {
    const uid = window.RPG?.getFbUser()?.uid;
    const map = await getMapDetails(mapId, uid);

    if (!map) throw new Error("Mapa não encontrado");

    const screenshots = Array.isArray(map.screenshots) ? map.screenshots : [];

    const screenshotsHtml = screenshots.length > 0
      ? `<div class="map-screenshots-grid">
           ${screenshots.map((url, i) => renderScreenshot(url, i)).join('')}
         </div>`
      : `<p style="color:var(--text-muted)">Nenhum screenshot disponível</p>`;

    content.innerHTML = `
      <div class="map-details-header">
        <h2>${escapeHtml(map.title)}</h2>
        <p class="map-author">
          <i class="fas fa-user"></i> Por ${escapeHtml(map.authorName)}
        </p>
      </div>

      <div class="map-screenshots-section">
        <h3><i class="fas fa-images"></i> Screenshots</h3>
        ${screenshotsHtml}
      </div>

      <div class="map-description-full">
        <h3><i class="fas fa-info-circle"></i> Descrição</h3>
        <p>${escapeHtml(map.description || "").replace(/\n/g, '<br>')}</p>
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
          <i class="fas fa-heart" style="color:#e74c3c"></i>
          <strong>${map.likes || 0}</strong>
          <span>Curtidas</span>
        </div>
        <div class="stat-box">
          <i class="fas fa-download" style="color:var(--gold)"></i>
          <strong>${map.downloads || 0}</strong>
          <span>Downloads</span>
        </div>
        <div class="stat-box">
          <i class="fas fa-eye" style="color:#3498db"></i>
          <strong>${map.views || 0}</strong>
          <span>Views</span>
        </div>
      </div>

      <div class="map-actions-full">
        <a href="${map.driveLink}" target="_blank" rel="noopener"
           class="btn-primary map-drive-btn"
           data-id="${map.id}">
          <i class="fas fa-external-link-alt"></i> Abrir no Drive
        </a>
        <button class="btn-secondary btn-like-modal ${map.userLiked ? 'liked' : ''}" data-id="${map.id}">
          <i class="fas fa-heart"></i> ${map.userLiked ? 'Curtido' : 'Curtir'}
        </button>
        <button class="btn-secondary btn-favorite-modal ${map.userFavorited ? 'favorited' : ''}" data-id="${map.id}">
          <i class="fas fa-star"></i> ${map.userFavorited ? 'Favoritado' : 'Favoritar'}
        </button>
      </div>
    `;

    // Download btn — increment counter and open drive link
    content.querySelector('.map-drive-btn')?.addEventListener('click', async (e) => {
      try {
        await incrementMapDownload(map.id);
      } catch (_) {}
    });

    content.querySelector('.btn-like-modal')?.addEventListener('click', async () => {
      await handleLikeMap(map.id);
      openMapDetailsModal(map.id);
    });

    content.querySelector('.btn-favorite-modal')?.addEventListener('click', async () => {
      await handleFavoriteMap(map.id);
      openMapDetailsModal(map.id);
    });

  } catch (err) {
    console.error("Erro ao abrir detalhes:", err);
    content.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-exclamation-triangle"></i>
        <p>Erro ao carregar detalhes: ${escapeHtml(err.message || "")}</p>
        <button class="btn-secondary" onclick="document.getElementById('mapDetailsModal').style.display='none'">
          Fechar
        </button>
      </div>`;
  }
}

async function handleFavoriteMap(mapId) {
  try {
    const uid = window.RPG?.getFbUser()?.uid;
    if (!uid) {
      window.showToast?.("Faça login para favoritar mapas", "warning");
      return;
    }

    const result = await favoriteMap(mapId, uid);
    window.showToast?.(
      result.favorited ? "⭐ Adicionado aos favoritos!" : "Removido dos favoritos",
      result.favorited ? "success" : "info"
    );
  } catch (err) {
    console.error("Erro ao favoritar mapa:", err);
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

  document.getElementById("mapTitle").value       = "";
  document.getElementById("mapDescription").value = "";
  document.getElementById("mapTopics").value       = "";
  document.getElementById("mapDriveLink").value    = "";
  document.getElementById("mapScreenshots").value  = "";

  modal.style.display = "flex";
}

async function openEditMapModal(mapId) {
  const modal = document.getElementById("submitMapModal");
  if (!modal) return;

  _editingMapId = mapId;
  document.getElementById("submitMapTitle").textContent = "Editar Mapa";

  try {
    const mapSnap = await get(ref(db, `maps/${mapId}`));
    if (!mapSnap.exists()) throw new Error("Mapa não encontrado");
    const map = mapSnap.val();

    document.getElementById("mapTitle").value       = map.title || "";
    document.getElementById("mapDescription").value = map.description || "";
    document.getElementById("mapTopics").value       = (map.topics || []).join(', ');
    document.getElementById("mapDriveLink").value    = map.driveLink || "";
    document.getElementById("mapScreenshots").value  = (map.screenshots || []).join('\n');

    modal.style.display = "flex";
  } catch (err) {
    console.error("Erro ao carregar mapa:", err);
    window.showToast?.("Erro ao carregar mapa: " + err.message, "error");
  }
}

/* ════════════════════════════════════════════════════════════════
   CARREGAR MAPAS EXEMPLO
════════════════════════════════════════════════════════════════ */
window.loadMapExamples = async function() {
  const container = document.getElementById("mapExamplesContainer");
  if (!container) return;

  try {
    const examples = await getMapExamples();

    if (examples.length === 0) {
      container.innerHTML = '<p style="color: var(--text-muted); font-size: 0.85rem;">Nenhum exemplo disponível</p>';
      return;
    }

    container.innerHTML = examples.map(ex => `
      <a href="${ex.downloadUrl}" target="_blank" class="map-example-link">
        <i class="fas fa-download"></i> ${escapeHtml(ex.title)}
      </a>
    `).join('');

  } catch (err) {
    console.error('Erro ao carregar exemplos:', err);
  }
};

/* ════════════════════════════════════════════════════════════════
   EVENT LISTENERS
════════════════════════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("openSubmitMapBtn")?.addEventListener("click", openSubmitMapModal);

  document.getElementById("closeSubmitMapModal")?.addEventListener("click", () => {
    document.getElementById("submitMapModal").style.display = "none";
  });
  document.getElementById("cancelSubmitMapBtn")?.addEventListener("click", () => {
    document.getElementById("submitMapModal").style.display = "none";
  });

  document.getElementById("closeMapDetailsModal")?.addEventListener("click", () => {
    document.getElementById("mapDetailsModal").style.display = "none";
  });
  document.getElementById("mapDetailsModal")?.addEventListener("click", e => {
    if (e.target.id === "mapDetailsModal")
      e.target.style.display = "none";
  });

  // Enviar / Editar mapa
  document.getElementById("confirmSubmitMapBtn")?.addEventListener("click", async () => {
    const title        = document.getElementById("mapTitle").value.trim();
    const description  = document.getElementById("mapDescription").value.trim();
    const topicsStr    = document.getElementById("mapTopics").value.trim();
    const driveLink    = document.getElementById("mapDriveLink").value.trim();
    const screenshotsStr = document.getElementById("mapScreenshots").value.trim();

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
      window.showToast?.("Adicione pelo menos 1 link de screenshot", "warning");
      return;
    }

    const topics      = topicsStr ? topicsStr.split(',').map(t => t.trim()).filter(Boolean) : [];
    const screenshots = screenshotsStr.split('\n').map(s => s.trim()).filter(Boolean);

    const btn = document.getElementById("confirmSubmitMapBtn");
    const origHtml = btn?.innerHTML;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...'; }

    try {
      const uid = window.RPG?.getFbUser()?.uid;
      if (!uid) throw new Error("Usuário não autenticado");

      const mapData = { title, description, topics, driveLink, screenshots };

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
      console.error("Erro ao enviar mapa:", err);
      window.showToast?.(err.message || "Erro ao enviar mapa", "error");
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = origHtml; }
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
    const q = e.target.value.toLowerCase().trim();
    if (!q) { renderRegionsMaps(_allMaps); return; }
    const filtered = _allMaps.filter(m =>
      (m.title || "").toLowerCase().includes(q) ||
      (m.authorName || "").toLowerCase().includes(q) ||
      (m.description || "").toLowerCase().includes(q)
    );
    renderRegionsMaps(filtered);
  });

  document.getElementById("refreshMapsBtn")?.addEventListener("click",    () => window.loadMyMaps?.(_currentMapFilter));
  document.getElementById("refreshRegionsBtn")?.addEventListener("click", () => window.loadRegions?.(_currentMapSort));
});

function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(String(text)));
  return div.innerHTML;
}
