import { loadGeoJSON } from './utils.js';
import {
  loadImagesIndex,
  featureCardHTML,
  hydrateMarkedText,
  getFeatureId,
  escapeHTML,
  imageUrl
} from './images-store.js';

const params = new URLSearchParams(location.search);
const imageIdParam = params.get('imageId');
const objectIdParam = params.get('objectId');

const elCanvas = document.getElementById('viewer-canvas');
const elViewport = document.getElementById('viewer-viewport');
const elLayers = document.getElementById('viewer-layers');
const elDetail = document.getElementById('viewer-detail');
const elPopover = document.getElementById('popover');
const elTitle = document.getElementById('viewer-title');
const elSubtitle = document.getElementById('viewer-subtitle');
const elCount = document.getElementById('viewer-image-count');
const elClipAmount = document.getElementById('clip-amount');
const elClipAmountValue = document.getElementById('clip-amount-value');
const elBlink = document.getElementById('blink-toggle');
const elReset = document.getElementById('reset-viewer');
const elFitToggle = document.getElementById('viewer-fit-toggle');

const state = {
  images: [],
  feature: null,
  referenceId: null,
  layerOrder: new Map(),
  assets: new Map(),
  clip: { direction: 'left', amount: 50 },
  drag: { active: false, direction: 'left' },
  viewMode: 'fit'
};

async function boot() {
  const [geo, imagesIndex] = await Promise.all([
    loadGeoJSON('./data/iscrizioni.geojson'),
    loadImagesIndex('./data/images.json')
  ]);

  let objectId = objectIdParam;

  if (imageIdParam) {
    const selected = imagesIndex.byId.get(String(imageIdParam));
    if (selected) objectId = selected.object_id;
  }

  if (!objectId) {
    throw new Error('Nessun objectId o imageId valido passato al viewer.');
  }

  state.images = (imagesIndex.byObject.get(String(objectId)) || []).slice();

  if (!state.images.length) {
    throw new Error(`Nessuna immagine trovata per ${objectId}.`);
  }

  const featureById = new Map((geo.features || []).map(f => [getFeatureId(f), f]));
  state.feature = featureById.get(String(objectId)) || null;

  state.referenceId =
    imageIdParam && state.images.some(img => String(img.id) === String(imageIdParam))
      ? String(imageIdParam)
      : String(state.images[0].id);

  resetOrder();
  await preloadAssets(state.images);
  renderMeta();
  renderDetail();
  renderLayerControls();
  renderStage();
  bindControls();
  syncToolbar();
}

function resetOrder() {
  state.layerOrder.clear();
  state.images.forEach((img, index) => {
    state.layerOrder.set(String(img.id), index + 1);
  });
}

async function preloadAssets(images) {
  await Promise.all(images.map(img => loadImgAsset(img)));
}

function loadImgAsset(img) {
  return new Promise(resolve => {
    const el = new Image();

    el.onload = () => {
      state.assets.set(String(img.id), {
        width: el.naturalWidth,
        height: el.naturalHeight,
        ok: true
      });
      resolve();
    };

    el.onerror = () => {
      state.assets.set(String(img.id), {
        width: 1200,
        height: 800,
        ok: false
      });
      resolve();
    };

    el.src = imageUrl(img.image);
  });
}

function bindControls() {
  elClipAmount?.addEventListener('input', () => {
    state.clip.amount = Number(elClipAmount.value || 0);
    applyCurtainState();
  });

  elBlink?.addEventListener('change', applyCurtainState);

  elFitToggle?.addEventListener('click', () => {
    state.viewMode = state.viewMode === 'fit' ? 'actual' : 'fit';
    renderStage();
    syncToolbar();
  });

  elReset?.addEventListener('click', () => {
    resetOrder();
    state.clip.direction = 'left';
    state.clip.amount = 50;
    state.viewMode = 'fit';

    if (elClipAmount) elClipAmount.value = '50';
    if (elBlink) elBlink.checked = false;

    renderLayerControls();
    renderStage();
    syncToolbar();
  });

  const stopDrag = () => {
    state.drag.active = false;
    document.body.classList.remove('is-dragging-curtain');
  };

  const onMove = evt => {
    if (!state.drag.active) return;
    evt.preventDefault();
    updateCurtainFromEvent(evt, state.drag.direction);
  };

  window.addEventListener('mousemove', onMove);
  window.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('mouseup', stopDrag);
  window.addEventListener('touchend', stopDrag);
  window.addEventListener('mouseleave', stopDrag);
  window.addEventListener('resize', handleViewportResize);

  if (window.ResizeObserver && elViewport) {
    const ro = new ResizeObserver(handleViewportResize);
    ro.observe(elViewport);
  }
}

function handleViewportResize() {
  if (state.viewMode === 'fit') {
    renderStage();
  }
}

function renderMeta() {
  const objectId = state.images[0]?.object_id || '(oggetto)';
  const place = state.feature?.properties
    ? [state.feature.properties.comune, state.feature.properties.localita].filter(Boolean).join(' · ')
    : '';

  if (elTitle) elTitle.textContent = objectId;
  if (elSubtitle) elSubtitle.textContent = place || 'Viewer di sovrapposizione';
  if (elCount) elCount.textContent = `${state.images.length} immagini`;
}

function renderDetail() {
  if (!elDetail) return;

  if (!state.feature) {
    elDetail.innerHTML =
      '<div class="empty"><div class="empty__title">Record non trovato</div><div class="empty__text">L&apos;immagine esiste ma non è stato trovato il record collegato nel GeoJSON.</div></div>';
    return;
  }

  elDetail.innerHTML = featureCardHTML(state.feature, state.images);
  hydrateMarkedText(elDetail, elPopover);
}

function buildOrderPills(imageId, currentOrder, maxOrder) {
  const safeId = escapeHTML(String(imageId));
  const pills = [];

  pills.push(
    `<button class="order-pill ${currentOrder === 0 ? 'is-active' : ''}" type="button" data-order-btn="${safeId}" data-order-value="0">0</button>`
  );

  for (let n = 1; n <= maxOrder; n++) {
    pills.push(
      `<button class="order-pill ${currentOrder === n ? 'is-active' : ''}" type="button" data-order-btn="${safeId}" data-order-value="${n}">${n}</button>`
    );
  }

  return pills.join('');
}

function buildLayerRow(img, order, isRef, maxOrder) {
  const safeId = escapeHTML(String(img.id));
  const safeImage = escapeHTML(String(img.image || ''));
  const safeTipo = escapeHTML(String(img.tipo || 'immagine'));

  return `
    <div class="layer-row">
      <div class="layer-row__thumb">
        <img src="${imageUrl(img.image)}" alt="${safeImage}" loading="lazy">
      </div>

      <div class="layer-row__body">
        <div class="layer-row__title">${safeImage}</div>
        <div class="layer-row__meta">
          <span class="mini-chip">${safeTipo}</span>
          ${isRef ? '<span class="mini-chip mini-chip--accent">riferimento</span>' : ''}
        </div>
      </div>

      <div class="inline-field inline-field--compact">
        <span>Ordine</span>
        <div class="order-pills">
          ${buildOrderPills(img.id, order, maxOrder)}
        </div>
      </div>

      <button
        class="iconbtn"
        type="button"
        data-set-reference="${safeId}"
        title="Usa come riferimento geometrico"
      >
        <i class="bi bi-bullseye"></i>
      </button>
    </div>
  `;
}

function renderLayerControls() {
  if (!elLayers) return;

  const maxOrder = state.images.length;

  elLayers.innerHTML = `
    <div class="viewer-layers__head">
      <div>
        <div class="section__title">Piani di sovrapposizione</div>
        <div class="section__hint">Ordine 1 = primo piano · 0 = esclusa</div>
      </div>
    </div>

    <div class="viewer-layers__list">
      ${state.images
        .map(img => {
          const order = state.layerOrder.get(String(img.id)) || 0;
          const isRef = String(img.id) === String(state.referenceId);
          return buildLayerRow(img, order, isRef, maxOrder);
        })
        .join('')}
    </div>
  `;

  elLayers.querySelectorAll('[data-order-btn]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = String(btn.getAttribute('data-order-btn') || '');
      const value = Number(btn.getAttribute('data-order-value') || 0);

      state.layerOrder.set(id, value);
      normalizeOrders(id);
      renderLayerControls();
      renderStage();
    });
  });

  elLayers.querySelectorAll('[data-set-reference]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.referenceId = String(btn.getAttribute('data-set-reference') || '');
      renderLayerControls();
      renderStage();
    });
  });
}

function normalizeOrders(preferredId = null) {
  const positives = [...state.layerOrder.entries()].filter(([, order]) => order > 0);
  const grouped = new Map();

  for (const [id, order] of positives) {
    if (!grouped.has(order)) grouped.set(order, []);
    grouped.get(order).push(id);
  }

  for (const [order, ids] of grouped.entries()) {
    if (ids.length <= 1) continue;

    ids.sort((a, b) => {
      if (a === preferredId) return -1;
      if (b === preferredId) return 1;
      return String(a).localeCompare(String(b), 'it');
    });

    ids.forEach((id, index) => {
      state.layerOrder.set(id, index === 0 ? order : order + index);
    });
  }

  const normalized = [...state.layerOrder.entries()]
    .filter(([, order]) => order > 0)
    .sort((a, b) => a[1] - b[1]);

  normalized.forEach(([id], index) => {
    state.layerOrder.set(id, index + 1);
  });
}

function buildStageLayer(img, index, order, transform, displayScale) {
  const asset = state.assets.get(String(img.id)) || {
    width: 1200,
    height: 800,
    ok: false
  };

  const isFront = index === 0;
  const blinkClass = isFront && elBlink?.checked ? 'viewer-layer--blink' : '';
  const frontClass = isFront ? 'viewer-layer--front' : '';
  const safeId = escapeHTML(String(img.id));
  const safeImage = escapeHTML(String(img.image || ''));
  const width = asset.width * displayScale;
  const height = asset.height * displayScale;

  return `
    <img
      class="viewer-layer ${frontClass} ${blinkClass}"
      data-layer-id="${safeId}"
      src="${imageUrl(img.image)}"
      alt="${safeImage}"
      style="width:${width}px;height:${height}px;transform:${transform};z-index:${100 - order};"
      onerror="this.classList.add('viewer-layer--missing')"
    />
  `;
}

function renderStage() {
  if (!elCanvas) return;

  const visible = getVisibleImages();

  if (!visible.length) {
    elCanvas.innerHTML =
      '<div class="empty"><div class="empty__title">Nessun piano attivo</div><div class="empty__text">Assegna almeno un ordine a un&apos;immagine per attivare la sovrapposizione.</div></div>';
    return;
  }

  const ref = visible.find(img => String(img.id) === String(state.referenceId)) || visible[0];
  const refAsset = state.assets.get(String(ref.id)) || { width: 1200, height: 800 };
  const displayScale = getDisplayScale(refAsset);

  elCanvas.style.width = `${refAsset.width * displayScale}px`;
  elCanvas.style.height = `${refAsset.height * displayScale}px`;

  let html = '';

  visible.forEach((img, index) => {
    const transform = computeLayerTransform(img, ref, displayScale);
    const order = state.layerOrder.get(String(img.id)) || 0;
    html += buildStageLayer(img, index, order, transform, displayScale);
  });

  if (visible.length > 1) {
    html += `
      <div class="viewer-curtain" id="viewer-curtain">
        <span class="viewer-curtain__knob"></span>
      </div>
      <div class="viewer-edge-handle" data-edge="left"></div>
      <div class="viewer-edge-handle" data-edge="right"></div>
      <div class="viewer-edge-handle" data-edge="top"></div>
      <div class="viewer-edge-handle" data-edge="bottom"></div>
    `;
  }

  elCanvas.innerHTML = html;

  if (state.viewMode === 'fit' && elViewport) {
    elViewport.scrollLeft = 0;
    elViewport.scrollTop = 0;
  }

  bindStageInteractions();
  applyCurtainState();
}

function getDisplayScale(refAsset) {
  if (state.viewMode === 'actual') return 1;
  if (!elViewport) return 1;

  const availableWidth = Math.max(120, elViewport.clientWidth - 24);
  const availableHeight = Math.max(120, elViewport.clientHeight - 24);

  return Math.min(
    availableWidth / Math.max(1, refAsset.width),
    availableHeight / Math.max(1, refAsset.height),
    1
  );
}

function bindStageInteractions() {
  const curtain = elCanvas.querySelector('#viewer-curtain');

  if (curtain) {
    const startCurrentDrag = evt => startCurtainDrag(evt, state.clip.direction);
    curtain.addEventListener('mousedown', startCurrentDrag);
    curtain.addEventListener('touchstart', startCurrentDrag, { passive: false });
  }

  elCanvas.querySelectorAll('[data-edge]').forEach(handle => {
    const start = evt => {
      startCurtainDrag(evt, String(handle.getAttribute('data-edge') || 'left'));
    };
    handle.addEventListener('mousedown', start);
    handle.addEventListener('touchstart', start, { passive: false });
  });
}

function startCurtainDrag(evt, direction) {
  evt.preventDefault();
  state.drag.active = true;
  state.drag.direction = direction;
  state.clip.direction = direction;
  document.body.classList.add('is-dragging-curtain');
  syncToolbar();
  updateCurtainFromEvent(evt, direction);
}

function updateCurtainFromEvent(evt, direction) {
  const point = getClientPoint(evt);
  if (!point || !elCanvas) return;

  const rect = elCanvas.getBoundingClientRect();
  const x = clamp(point.clientX - rect.left, 0, rect.width);
  const y = clamp(point.clientY - rect.top, 0, rect.height);

  let amount = state.clip.amount;

  if (direction === 'right') amount = ((rect.width - x) / rect.width) * 100;
  else if (direction === 'top') amount = (y / rect.height) * 100;
  else if (direction === 'bottom') amount = ((rect.height - y) / rect.height) * 100;
  else amount = (x / rect.width) * 100;

  state.clip.amount = clamp(amount, 0, 100);
  syncToolbar();
  applyCurtainState();
}

function applyCurtainState() {
  const front = elCanvas?.querySelector('.viewer-layer--front');
  const curtain = elCanvas?.querySelector('#viewer-curtain');

  if (front) {
    front.style.clipPath = curtain ? clipPathCSS(state.clip.direction, state.clip.amount) : 'none';
    front.classList.toggle('viewer-layer--blink', Boolean(elBlink?.checked));
  }

  if (curtain) {
    curtain.classList.toggle(
      'is-vertical',
      state.clip.direction === 'left' || state.clip.direction === 'right'
    );
    curtain.classList.toggle(
      'is-horizontal',
      state.clip.direction === 'top' || state.clip.direction === 'bottom'
    );

    curtain.style.left = '';
    curtain.style.right = '';
    curtain.style.top = '';
    curtain.style.bottom = '';

    if (state.clip.direction === 'right') curtain.style.left = `${100 - state.clip.amount}%`;
    else if (state.clip.direction === 'top') curtain.style.top = `${state.clip.amount}%`;
    else if (state.clip.direction === 'bottom') curtain.style.top = `${100 - state.clip.amount}%`;
    else curtain.style.left = `${state.clip.amount}%`;
  }

  if (elClipAmountValue) {
    elClipAmountValue.textContent = `${Math.round(state.clip.amount)}%`;
  }

  if (elClipAmount && Number(elClipAmount.value) !== Math.round(state.clip.amount)) {
    elClipAmount.value = String(Math.round(state.clip.amount));
  }
}

function syncToolbar() {
  if (elClipAmountValue) elClipAmountValue.textContent = `${Math.round(state.clip.amount)}%`;
  if (elClipAmount) elClipAmount.value = String(Math.round(state.clip.amount));

  if (elFitToggle) {
    const icon = elFitToggle.querySelector('i');
    const isActual = state.viewMode === 'actual';
    elFitToggle.classList.toggle('is-active', isActual);
    elFitToggle.setAttribute('aria-pressed', isActual ? 'true' : 'false');
    elFitToggle.title = isActual ? 'Adatta al riquadro' : 'Mostra a dimensione reale';
    if (icon) {
      icon.className = isActual ? 'bi bi-bounding-box-circles' : 'bi bi-arrows-angle-expand';
    }
  }
}

function getVisibleImages() {
  return state.images
    .filter(img => (state.layerOrder.get(String(img.id)) || 0) > 0)
    .sort(
      (a, b) =>
        (state.layerOrder.get(String(a.id)) || 999) -
        (state.layerOrder.get(String(b.id)) || 999)
    );
}

function clipPathCSS(direction, amount) {
  const v = Math.max(0, Math.min(100, amount));
  if (direction === 'right') return `inset(0 ${100 - v}% 0 0)`;
  if (direction === 'top') return `inset(0 0 ${100 - v}% 0)`;
  if (direction === 'bottom') return `inset(${100 - v}% 0 0 0)`;
  return `inset(0 0 0 ${100 - v}%)`;
}

function computeLayerTransform(image, reference, displayScale = 1) {
  if (String(image.id) === String(reference.id)) {
    return 'matrix(1,0,0,1,0,0)';
  }

  const srcPoints = sanitizePoints(image.coord);
  const dstPoints = sanitizePoints(reference.coord);

  if (
    srcPoints.length < 3 ||
    dstPoints.length < 3 ||
    srcPoints.length !== dstPoints.length
  ) {
    return 'matrix(1,0,0,1,0,0)';
  }

  const srcNorm = normalizePointsToBBox(srcPoints);
  const dstNorm = normalizePointsToBBox(dstPoints);

  if (!srcNorm || !dstNorm) {
    return 'matrix(1,0,0,1,0,0)';
  }

  const params = fitAffine(srcNorm.points, dstNorm.points);
  if (!params) {
    return 'matrix(1,0,0,1,0,0)';
  }

  const [ax, byX, cxY, dy, tx, ty] = params;
  const srcAsset = state.assets.get(String(image.id)) || { width: 1, height: 1 };
  const dstAsset = state.assets.get(String(reference.id)) || { width: 1, height: 1 };
  const srcW = srcAsset.width * displayScale;
  const srcH = srcAsset.height * displayScale;
  const dstW = dstAsset.width * displayScale;
  const dstH = dstAsset.height * displayScale;

  const m11 = (dstW * ax) / Math.max(1, srcW);
  const m12 = (dstH * cxY) / Math.max(1, srcW);
  const m21 = (dstW * byX) / Math.max(1, srcH);
  const m22 = (dstH * dy) / Math.max(1, srcH);
  const m41 = dstW * tx;
  const m42 = dstH * ty;

  return `matrix(${m11},${m12},${m21},${m22},${m41},${m42})`;
}

function sanitizePoints(points) {
  return (Array.isArray(points) ? points : [])
    .filter(
      pt =>
        Array.isArray(pt) &&
        pt.length >= 2 &&
        isFiniteNum(pt[0]) &&
        isFiniteNum(pt[1])
    )
    .map(([x, y]) => [Number(x), Number(y)]);
}

function normalizePointsToBBox(points) {
  if (!points.length) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  const spanX = Math.max(1e-6, maxX - minX);
  const spanY = Math.max(1e-6, maxY - minY);

  return {
    points: points.map(([x, y]) => [(x - minX) / spanX, (y - minY) / spanY]),
    minX,
    minY,
    spanX,
    spanY
  };
}

function fitAffine(srcPts, dstPts) {
  const n = Math.min(srcPts.length, dstPts.length);
  const A = Array.from({ length: 6 }, () => Array(6).fill(0));
  const B = Array(6).fill(0);

  for (let i = 0; i < n; i++) {
    const [x, y] = srcPts[i];
    const [X, Y] = dstPts[i];

    if (!isFiniteNum(x) || !isFiniteNum(y) || !isFiniteNum(X) || !isFiniteNum(Y)) {
      continue;
    }

    const r1 = [x, y, 0, 0, 1, 0];
    const r2 = [0, 0, x, y, 0, 1];

    accumulateNormal(A, B, r1, X);
    accumulateNormal(A, B, r2, Y);
  }

  return solveLinearSystem(A, B);
}

function accumulateNormal(A, B, row, value) {
  for (let i = 0; i < 6; i++) {
    B[i] += row[i] * value;
    for (let j = 0; j < 6; j++) {
      A[i][j] += row[i] * row[j];
    }
  }
}

function solveLinearSystem(A, B) {
  const M = A.map((row, i) => row.concat(B[i]));
  const n = M.length;

  for (let col = 0; col < n; col++) {
    let pivot = col;

    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[pivot][col])) {
        pivot = row;
      }
    }

    if (Math.abs(M[pivot][col]) < 1e-8) return null;

    if (pivot !== col) {
      [M[pivot], M[col]] = [M[col], M[pivot]];
    }

    const factor = M[col][col];
    for (let j = col; j <= n; j++) {
      M[col][j] /= factor;
    }

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const f = M[row][col];
      for (let j = col; j <= n; j++) {
        M[row][j] -= f * M[col][j];
      }
    }
  }

  return M.map(row => row[n]);
}

function getClientPoint(evt) {
  if (evt.touches && evt.touches.length) return evt.touches[0];
  if (evt.changedTouches && evt.changedTouches.length) return evt.changedTouches[0];
  return evt;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, Number(v)));
}

function isFiniteNum(v) {
  return Number.isFinite(Number(v));
}

boot().catch(err => {
  console.error(err);

  if (elCanvas) {
    elCanvas.innerHTML = `
      <div class="empty">
        <div class="empty__title">Errore</div>
        <div class="empty__text">${escapeHTML(err?.message || String(err))}</div>
      </div>
    `;
  }
});
