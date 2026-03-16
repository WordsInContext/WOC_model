import { loadGeoJSON } from './utils.js';
import { initCharts, updateCharts } from './charts.js';
import { initMap } from './map.js';
import { initFilters } from './filters.js';
import { loadImagesIndex, featureCardHTML, hydrateMarkedText, getFeatureId, selectionSummaryHTML } from './images-store.js';

const PATHS = {
  iscrizioni: './data/iscrizioni.geojson',
  province: './data/province.geojson',
  images: './data/images.json',
};

const elCount = document.getElementById('meta-count');
const elTime = document.getElementById('meta-time');
const elStatus = document.getElementById('hud-status');
const elDetail = document.getElementById('detail');
const elPopover = document.getElementById('popover');

let imageIndex = { byObject: new Map(), byId: new Map(), rows: [] };

function setStatus(text){
  if(elStatus) elStatus.textContent = text;
}

function startClock(){
  if(!elTime) return;
  const tick = () => {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2,'0');
    const mm = String(d.getMinutes()).padStart(2,'0');
    elTime.textContent = `${hh}:${mm}`;
  };
  tick();
  setInterval(tick, 1000 * 10);
}

async function safeLoadGeoJSON(url, fallback){
  try{
    return await loadGeoJSON(url);
  }catch(err){
    console.warn(`Fallback per ${url}:`, err);
    return fallback;
  }
}

async function boot(){
  startClock();
  initCharts();

  try{
    setStatus('Caricamento GeoJSON...');

    const [iscrizioni, provinces, images] = await Promise.all([
      loadGeoJSON(PATHS.iscrizioni),
      safeLoadGeoJSON(PATHS.province, { type: 'FeatureCollection', features: [] }),
      loadImagesIndex(PATHS.images).catch(err => {
        console.warn('Indice immagini non disponibile:', err);
        return { byObject: new Map(), byId: new Map(), rows: [] };
      }),
    ]);

    imageIndex = images;

    const allFeatures = (iscrizioni?.features || []).slice();
    const total = allFeatures.length;
    if(elCount) elCount.textContent = `${total} record`;

    const mapApi = initMap({
      provinces,
      inscriptions: iscrizioni,
      onSelectFeatures: (fs) => renderDetail(fs),
      onStatus: setStatus,
    });

    const mountEl = document.getElementById('filters-actions');
    initFilters({
      mountEl,
      allFeatures,
      onFiltered: ({ filteredFeatures }) => {
        const n = filteredFeatures.length;
        if(elCount){
          elCount.textContent = (n === total) ? `${total} record` : `${n} / ${total} record`;
        }

        updateCharts(filteredFeatures);
        mapApi?.setInscriptions?.(filteredFeatures);
        mapApi?.clearSelection?.();
        renderDetail([]);

        setStatus(`Pronto · ${n} punti visibili`);
      }
    });

    addGalleryButton(mountEl, images.rows.length);
    setStatus(`Pronto · ${allFeatures.length} punti · ${images.rows.length} immagini`);
  }catch(err){
    console.error(err);
    setStatus('Errore nel caricamento');

    if(elDetail){
      elDetail.innerHTML = `
        <div class="empty">
          <div class="empty__title">Errore</div>
          <div class="empty__text">${escapeHTML(err?.message || String(err))}</div>
          <div class="empty__text">
            Nota: se apri il file <code>index.html</code> direttamente da disco, alcuni browser bloccano
            <code>fetch()</code>. Avvia un server locale (es. <code>python3 -m http.server</code>)
            o usa GitHub Pages.
          </div>
        </div>
      `;
    }
  }
}

function addGalleryButton(mountEl, count = 0){
  if(!mountEl) return;
  const a = document.createElement('a');
  a.className = 'actionbtn actionbtn--gallery';
  a.href = './gallery.html';
  a.title = 'Apri galleria immagini';
  a.setAttribute('aria-label', 'Apri galleria immagini');
  a.innerHTML = `
    <i class="bi bi-images" aria-hidden="true"></i>
    ${count ? `<span class="actionbtn__badge">${count}</span>` : ''}
  `;
  mountEl.appendChild(a);
}

function renderDetail(features){
  const fs = (features || []).filter(Boolean);
  if(!elDetail) return;

  if(fs.length === 0){
    elDetail.innerHTML = `
      <div class="empty">
        <div class="empty__title">Nessuna selezione</div>
        <div class="empty__text">Seleziona un punto sulla mappa per visualizzare i campi del record.</div>
      </div>
    `;
    return;
  }

  const summary = selectionSummaryHTML(fs, imageIndex.byObject);
  const cards = fs.map(f => {
    const objectId = getFeatureId(f);
    const images = imageIndex.byObject.get(objectId) || [];
    return featureCardHTML(f, images);
  }).join('');

  elDetail.innerHTML = `${summary}<div class="cards">${cards}</div>`;
  hydrateMarkedText(elDetail, elPopover);
}

function escapeHTML(s){
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;');
}

boot();
