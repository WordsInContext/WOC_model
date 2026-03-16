import { renderMarkedText, attachMarkupInteractions } from './markup.js';

export async function loadImagesIndex(url = './data/images.json'){
  const res = await fetch(url);
  if(!res.ok) throw new Error(`Impossibile caricare ${url} (${res.status})`);
  const rows = await res.json();
  const byObject = new Map();
  const byId = new Map();
  for(const row of rows || []){
    const img = normalizeImageRecord(row);
    byId.set(String(img.id), img);
    const key = String(img.object_id || '').trim();
    if(!byObject.has(key)) byObject.set(key, []);
    byObject.get(key).push(img);
  }
  for(const arr of byObject.values()){
    arr.sort((a,b) => {
      const ta = typeRank(a.tipo);
      const tb = typeRank(b.tipo);
      if(ta !== tb) return ta - tb;
      return String(a.image).localeCompare(String(b.image), 'it');
    });
  }
  return { rows, byObject, byId };
}

function normalizeImageRecord(row){
  return {
    id: row.id,
    image: String(row.image || '').trim(),
    object_id: String(row.object_id || '').trim(),
    tipo: String(row.tipo || '').trim(),
    coord: Array.isArray(row.coord) ? row.coord : [],
  };
}

function typeRank(tipo){
  const t = String(tipo || '').toLowerCase();
  if(t.includes('foto')) return 0;
  if(t.includes('apografo')) return 1;
  if(t.includes('disegno')) return 2;
  return 9;
}

export function imageUrl(imageName){
  return `./data/images/${encodeURIComponent(imageName)}`;
}

export function imageThumbHTML(img, options = {}){
  const {
    caption = true,
    href = `./viewer.html?imageId=${encodeURIComponent(img.id)}`,
    extraMeta = '',
    className = '',
  } = options;

  return `
    <a class="image-thumb ${className}" href="${href}">
      <span class="image-thumb__frame">
        <img src="${imageUrl(img.image)}" alt="${escapeAttr(img.image)}" loading="lazy" onerror="this.closest('.image-thumb')?.classList.add('is-missing')">
      </span>
      ${caption ? `
        <span class="image-thumb__meta">
          <span class="image-thumb__type">${escapeHTML(img.tipo || 'immagine')}</span>
          <span class="image-thumb__name">${escapeHTML(img.image)}</span>
          ${extraMeta}
        </span>
      ` : ''}
    </a>
  `;
}

export function selectionSummaryHTML(features, imagesByObject){
  const fs = (features || []).filter(Boolean);
  if(fs.length <= 1) return '';
  let totalImages = 0;
  for(const f of fs){
    const objectId = getFeatureId(f);
    totalImages += (imagesByObject.get(objectId) || []).length;
  }
  return `
    <div class="selection-summary">
      <div class="selection-summary__title">Cluster selezionato</div>
      <div class="selection-summary__text">${fs.length} oggetti · ${totalImages} immagini collegate. Ogni scheda mantiene la propria mini-galleria per disambiguare rapidamente i record.</div>
    </div>
  `;
}

export function featureCardHTML(feature, images = []){
  const p = feature.properties || {};

  const lingua = p.lingua || '(n/d)';
  const luogo = [p.comune, p.localita].filter(Boolean).join(' - ');
  const id = getFeatureId(feature);

  const originale = p.iscrizione_originale_gr;
  const trascritta = p.iscrizione_trascritta;
  const tradotta = p.iscrizione_tradotta;

  const chips = [p.provincia, p.periodo, `Fase ${p.fase || 'n/d'}`]
    .filter(Boolean)
    .map(v => `<span class="chip">${escapeHTML(v)}</span>`)
    .join('');

  const argomenti = String(p.argomento || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 6)
    .map(a => `<span class="tag">${escapeHTML(a)}</span>`)
    .join('');

  const biblio = Array.isArray(p.bibliografia)
    ? p.bibliografia
    : (p.bibliografia ? [p.bibliografia] : []);

  const imageStrip = images.length
    ? `
      <div class="card__block">
        <div class="block__title block__title--split">
          <span>Immagini</span>
          <span class="block__meta">${images.length} risorsa${images.length > 1 ? 'e' : ''}</span>
        </div>
        <div class="image-strip">
          ${images.slice(0, 4).map(img => imageThumbHTML(img, { caption: false })).join('')}
        </div>
        <div class="image-strip__foot">
          ${images.slice(0, 3).map(img => `<span class="mini-chip">${escapeHTML(img.tipo || 'immagine')}</span>`).join('')}
          <a class="text-link" href="./viewer.html?objectId=${encodeURIComponent(id)}">Apri viewer dell'oggetto</a>
        </div>
      </div>
    `
    : `
      <div class="card__block">
        <div class="block__title">Immagini</div>
        <span class="muted">Nessuna risorsa grafica collegata a questo record.</span>
      </div>
    `;

  return `
    <article class="card">
      <div class="card__head">
        <div class="card__title">
          <span class="badge badge--${lingua.toLowerCase().includes('mess') ? 'messapico' : 'greco'}">${escapeHTML(lingua)}</span>
          <span class="card__id">${escapeHTML(id)}</span>
        </div>
        <div class="card__sub">${escapeHTML(luogo || p.comune || p.provincia || '')}</div>
        <div class="chips">${chips}</div>
      </div>

      <div class="card__grid">
        ${kv('provincia', p.provincia)}
        ${kv('comune', p.comune)}
        ${kv('sito', p.sito)}
        ${kv('anno_ritrovamento', p.anno_ritrovamento)}
        ${kv('datazione', rangeLabel(p.datazione_inizio, p.datazione_fine))}
        ${kv('precisione_coord_m', p.precisione_coord_m)}
        ${kv('affidabilita_lettura', p.affidabilita_lettura)}
      </div>

      ${imageStrip}

      <div class="card__block">
        <div class="block__title">Testi</div>

        <div class="texts">
          <div class="texts__section">
            <div class="texts__k">Originale</div>
            <div class="texts__v mono">${originale ? escapeHTML(originale) : '<span class="muted">/</span>'}</div>
          </div>

          <div class="texts__divider"></div>

          <div class="texts__section">
            <div class="texts__k">Trascrizione</div>
            <div class="texts__v mono" data-inscrizione-trascritta="${escapeAttr(trascritta || '')}"></div>
          </div>

          <div class="texts__divider"></div>

          <div class="texts__section">
            <div class="texts__k">Traduzione / interpretazione</div>
            <div class="texts__v">${tradotta ? escapeHTML(tradotta) : '<span class="muted">/</span>'}</div>
          </div>
        </div>
      </div>

      <div class="card__block">
        <div class="block__title">Argomenti</div>
        <div class="tags">${argomenti || '<span class="muted">(n/d)</span>'}</div>
      </div>

      <div class="card__block">
        <div class="block__title">Supporto</div>
        <div class="card__grid">
          ${kv('tipologia', p.supporto_tipologia)}
          ${kv('materiale', p.supporto_materiale)}
          ${kv('contesto', p.supporto_contesto)}
          ${kv('dimensioni_cm', p.supporto_dimensioni_cm)}
          ${kv('stato_conservazione', p.stato_conservazione)}
          ${kv('scrittura', p.scrittura)}
        </div>
      </div>

      <div class="card__block">
        <div class="block__title">Bibliografia</div>
        ${biblio.length
          ? `<ul class="biblio">${biblio.map(x => `<li>${escapeHTML(x)}</li>`).join('')}</ul>`
          : '<span class="muted">(n/d)</span>'
        }
      </div>

      <div class="card__foot">
        ${kvInline('collocazione_attuale', p.collocazione_attuale)}
        ${kvInline('inventario', p.inventario)}
        ${kvInline('ultima_modifica', p.ultima_modifica)}
      </div>
    </article>
  `;
}

export function hydrateMarkedText(root, popover){
  if(!root) return;
  for(const node of root.querySelectorAll('[data-inscrizione-trascritta]')){
    const raw = node.getAttribute('data-inscrizione-trascritta') || '';
    node.innerHTML = '';
    node.appendChild(renderMarkedText(raw));
  }
  attachMarkupInteractions(root, popover);
}

export function getFeatureId(feature){
  const p = feature?.properties || {};
  return String(feature?.id || p.uid || p.id || '(id)');
}

export function featureLabel(feature){
  const p = feature?.properties || {};
  const id = getFeatureId(feature);
  const luogo = [p.comune, p.localita].filter(Boolean).join(' · ');
  return luogo ? `${id} · ${luogo}` : id;
}

function kv(key, value){
  if(value == null || String(value).trim() === ''){
    return `<div class="kv"><span class="k">${escapeHTML(key)}</span><span class="v muted">(n/d)</span></div>`;
  }
  return `<div class="kv"><span class="k">${escapeHTML(key)}</span><span class="v">${escapeHTML(value)}</span></div>`;
}

function kvInline(key, value){
  if(value == null || String(value).trim() === '') return '';
  return `<span class="foot__kv"><span class="foot__k">${escapeHTML(key)}</span><span class="foot__v">${escapeHTML(value)}</span></span>`;
}

function rangeLabel(a, b){
  const A = Number(a);
  const B = Number(b);
  if(!Number.isFinite(A) || !Number.isFinite(B)) return '(n/d)';
  const fmt = (x) => x < 0 ? `${Math.abs(x)} a.C.` : `${x} d.C.`;
  return `${fmt(A)} - ${fmt(B)}`;
}

export function escapeHTML(s){
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;');
}

export function escapeAttr(s){
  return escapeHTML(s).replaceAll('"','&quot;');
}
