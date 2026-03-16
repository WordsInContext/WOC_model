import { loadGeoJSON } from './utils.js';
import { loadImagesIndex, imageUrl, getFeatureId, featureLabel, escapeHTML } from './images-store.js';

const elGrid = document.getElementById('gallery-grid');
const elSearch = document.getElementById('gallery-search');
const elCount = document.getElementById('gallery-count');

let rows = [];

async function boot(){
  const [geo, images] = await Promise.all([
    loadGeoJSON('./data/iscrizioni.geojson'),
    loadImagesIndex('./data/images.json'),
  ]);

  const featureById = new Map((geo.features || []).map(f => [getFeatureId(f), f]));
  rows = images.rows.map(img => {
    const feature = featureById.get(String(img.object_id));
    const p = feature?.properties || {};
    return {
      ...img,
      feature,
      label: feature ? featureLabel(feature) : img.object_id,
      searchText: [
        img.object_id,
        img.image,
        img.tipo,
        p.comune,
        p.localita,
        p.provincia,
        p.periodo,
        p.fase,
        p.supporto_tipologia,
      ].filter(Boolean).join(' ').toLowerCase()
    };
  });

  render(rows);
  elSearch?.addEventListener('input', () => {
    const q = String(elSearch.value || '').trim().toLowerCase();
    const filtered = q ? rows.filter(r => r.searchText.includes(q)) : rows;
    render(filtered);
  });
}

function render(items){
  if(!elGrid) return;
  if(elCount) elCount.textContent = `${items.length} immagini`;

  if(!items.length){
    elGrid.innerHTML = `
      <div class="empty">
        <div class="empty__title">Nessun risultato</div>
        <div class="empty__text">Prova a cambiare i termini di ricerca.</div>
      </div>
    `;
    return;
  }

  elGrid.innerHTML = items.map(item => cardHTML(item)).join('');
}

function cardHTML(item){
  const p = item.feature?.properties || {};
  return `
    <article class="gallery-card">
      <a class="gallery-card__image" href="./viewer.html?imageId=${encodeURIComponent(item.id)}">
        <img src="${imageUrl(item.image)}" alt="${escapeHTML(item.image)}" loading="lazy" onerror="this.parentElement.classList.add('is-missing')">
      </a>
      <div class="gallery-card__body">
        <div class="gallery-card__top">
          <div>
            <div class="gallery-card__title">${escapeHTML(item.object_id)}</div>
            <div class="gallery-card__subtitle">${escapeHTML([p.comune, p.localita].filter(Boolean).join(' · ') || p.provincia || '')}</div>
          </div>
          <span class="mini-chip">${escapeHTML(item.tipo || 'immagine')}</span>
        </div>
        <div class="gallery-card__meta">
          <span><strong>file</strong> ${escapeHTML(item.image)}</span>
          <span><strong>cronologia</strong> ${escapeHTML(p.periodo || '(n/d)')}</span>
          <span><strong>supporto</strong> ${escapeHTML(p.supporto_tipologia || '(n/d)')}</span>
          <span><strong>lingua</strong> ${escapeHTML(p.lingua || '(n/d)')}</span>
        </div>
        <div class="gallery-card__foot">
          <a class="text-link" href="./viewer.html?imageId=${encodeURIComponent(item.id)}">Apri viewer</a>
          <a class="text-link" href="./webgis.html#${encodeURIComponent(item.object_id)}">Apri mappa</a>
        </div>
      </div>
    </article>
  `;
}

boot().catch(err => {
  console.error(err);
  if(elGrid){
    elGrid.innerHTML = `
      <div class="empty">
        <div class="empty__title">Errore</div>
        <div class="empty__text">${escapeHTML(err?.message || String(err))}</div>
      </div>
    `;
  }
});
