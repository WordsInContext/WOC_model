import { parseCSVListField, parseDimsArea, romanToInt } from './utils.js';

/**
 * UI filtri in header (icone) + modal multi-select.
 * - legge automaticamente i valori possibili e mostra conteggi
 * - multi-select per ogni filtro
 * - conteggi faceted: quando apri un filtro, i count sono calcolati
 *   sui record gia filtrati dagli altri filtri (ignorando quello corrente)
 */

const MISSING = '__missing__';

function defaultDefs(areaBins){
  return [
    {
      id: 'lingua',
      label: 'Lingua',
      icon: 'bi-translate',
      type: 'set',
      get: (p) => p.lingua,
      sort: (a, b) => String(a).localeCompare(String(b), 'it')
    },
    {
      id: 'provincia',
      label: 'Provincia',
      icon: 'bi-geo-alt',
      type: 'set',
      get: (p) => p.provincia,
      sort: (a, b) => String(a).localeCompare(String(b), 'it')
    },
    {
      id: 'fase',
      label: 'Fase',
      icon: 'bi-bar-chart-steps',
      type: 'set',
      get: (p) => p.fase,
      sort: (a, b) => (romanToInt(a) || 999) - (romanToInt(b) || 999)
    },
    {
      id: 'periodo',
      label: 'Periodo',
      icon: 'bi-hourglass-split',
      type: 'set',
      get: (p) => p.periodo,
      sort: (a, b) => String(a).localeCompare(String(b), 'it')
    },
    {
      id: 'supporto_materiale',
      label: 'Materiale',
      icon: 'bi-bricks',
      type: 'set',
      get: (p) => p.supporto_materiale,
      sort: (a, b) => String(a).localeCompare(String(b), 'it')
    },
    {
      id: 'supporto_tipologia',
      label: 'Tipologia',
      icon: 'bi-bounding-box',
      type: 'set',
      get: (p) => p.supporto_tipologia,
      sort: (a, b) => String(a).localeCompare(String(b), 'it')
    },
    {
      id: 'supporto_contesto',
      label: 'Contesto',
      icon: 'bi-map',
      type: 'set',
      get: (p) => p.supporto_contesto,
      sort: (a, b) => String(a).localeCompare(String(b), 'it')
    },
    {
      id: 'argomento',
      label: 'Argomenti',
      icon: 'bi-tags',
      type: 'csvset',
      get: (p) => p.argomento,
      sort: (a, b) => String(a).localeCompare(String(b), 'it')
    },
    {
      id: 'area_cm2',
      label: 'Area',
      icon: 'bi-aspect-ratio',
      type: 'range',
      bins: areaBins,
      getNum: (p) => parseDimsArea(p.supporto_dimensioni_cm)?.area ?? null,
      sort: (a, b) => String(a).localeCompare(String(b), 'it')
    }
  ];
}

function computeAreaBins(features){
  const areas = [];
  for(const f of features || []){
    const p = f?.properties || {};
    const area = parseDimsArea(p.supporto_dimensioni_cm)?.area;
    if(Number.isFinite(area)) areas.push(area);
  }
  areas.sort((a,b)=>a-b);
  if(areas.length < 8){
    // fallback: bins fissi (cm2)
    return fixedBins();
  }

  const qs = [0, 0.2, 0.4, 0.6, 0.8, 1];
  const edges = [];
  for(const q of qs){
    const idx = Math.floor(q * (areas.length - 1));
    edges.push(areas[idx]);
  }

  // normalizza (rimuovi duplicati, forza monotonia)
  const uniq = [];
  for(const v of edges){
    const vv = Math.max(0, Math.round(v));
    if(uniq.length === 0 || vv > uniq[uniq.length-1]) uniq.push(vv);
  }

  if(uniq.length < 4) return fixedBins();

  const bins = [];
  for(let i=0;i<uniq.length-1;i++){
    const a = uniq[i];
    const b = uniq[i+1];
    const key = `${a}-${b}`;
    bins.push({ key, min: a, max: b, label: `${fmtInt(a)}–${fmtInt(b)} cm²` });
  }
  // ultimo bin: >= max
  const last = uniq[uniq.length-1];
  bins.push({ key: `${last}+`, min: last, max: Infinity, label: `≥ ${fmtInt(last)} cm²` });
  bins.push({ key: MISSING, min: null, max: null, label: '(n/d)' });
  return bins;
}

function fixedBins(){
  return [
    { key: '0-25', min: 0, max: 25, label: '0–25 cm²' },
    { key: '26-100', min: 26, max: 100, label: '26–100 cm²' },
    { key: '101-400', min: 101, max: 400, label: '101–400 cm²' },
    { key: '401-900', min: 401, max: 900, label: '401–900 cm²' },
    { key: '901-1600', min: 901, max: 1600, label: '901–1600 cm²' },
    { key: '1601+', min: 1601, max: Infinity, label: '≥ 1601 cm²' },
    { key: MISSING, min: null, max: null, label: '(n/d)' },
  ];
}

function fmtInt(n){
  try{ return new Intl.NumberFormat('it-IT').format(Number(n)); }
  catch(_){ return String(n); }
}

function normalizeValue(v){
  const s = String(v ?? '').trim();
  return s ? s : MISSING;
}

function labelForValue(v){
  return v === MISSING ? '(n/d)' : String(v);
}

function matchFeature(defs, feature, state, ignoreId=null){
  const p = feature?.properties || {};
  for(const def of defs){
    if(ignoreId && def.id === ignoreId) continue;
    const selected = state.get(def.id);
    if(!selected || selected.size === 0) continue;

    if(def.type === 'set'){
      const val = normalizeValue(def.get(p));
      if(!selected.has(val)) return false;
      continue;
    }
    if(def.type === 'csvset'){
      const list = parseCSVListField(def.get(p));
      if(list.length === 0){
        if(!selected.has(MISSING)) return false;
        continue;
      }
      let ok = false;
      for(const it of list){
        if(selected.has(normalizeValue(it))){ ok = true; break; }
      }
      if(!ok) return false;
      continue;
    }
    if(def.type === 'range'){
      const n = def.getNum(p);
      if(!Number.isFinite(n)){
        if(!selected.has(MISSING)) return false;
        continue;
      }
      const hit = [...selected].some(key => {
        if(key === MISSING) return false;
        const bin = def.bins.find(b => b.key === key);
        if(!bin) return false;
        return n >= bin.min && n <= bin.max;
      });
      if(!hit) return false;
      continue;
    }
  }
  return true;
}

function countsForDef(def, features){
  const counts = new Map();
  const add = (k) => counts.set(k, (counts.get(k) || 0) + 1);

  for(const f of features){
    const p = f?.properties || {};

    if(def.type === 'set'){
      add(normalizeValue(def.get(p)));
      continue;
    }
    if(def.type === 'csvset'){
      const list = parseCSVListField(def.get(p));
      if(list.length === 0){
        add(MISSING);
      }else{
        // conta 1 per feature per opzione
        const uniq = new Set(list.map(normalizeValue));
        for(const k of uniq) add(k);
      }
      continue;
    }
    if(def.type === 'range'){
      const n = def.getNum(p);
      if(!Number.isFinite(n)){
        add(MISSING);
        continue;
      }
      const bin = def.bins.find(b => b.key !== MISSING && n >= b.min && n <= b.max);
      add(bin ? bin.key : MISSING);
      continue;
    }
  }

  return counts;
}

function renderModalList({ container, def, counts, selected, query }){
  const q = String(query || '').trim().toLowerCase();

  // valori disponibili = key del counts
  let keys = [...counts.keys()];
  if(def.type === 'range'){
    // per range: mantieni ordine bins
    keys = def.bins.map(b => b.key).filter(k => counts.has(k));
  }

  // sort (tranne range)
  if(def.type !== 'range'){
    const sorter = def.sort || ((a,b)=>String(a).localeCompare(String(b),'it'));
    keys.sort((a,b)=>sorter(labelForValue(a), labelForValue(b)));
  }

  // filtro search
  if(q){
    keys = keys.filter(k => labelForValue(k).toLowerCase().includes(q));
  }

  const wrap = document.createElement('div');
  wrap.className = 'optlist';

  for(const k of keys){
    const id = `opt-${def.id}-${hashKey(k)}`;
    const row = document.createElement('div');
    row.className = 'opt';

    const left = document.createElement('div');
    left.className = 'opt__left';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = id;
    cb.checked = selected.has(k);
    cb.addEventListener('change', () => {
      if(cb.checked) selected.add(k); else selected.delete(k);
    });

    const lab = document.createElement('label');
    lab.htmlFor = id;
    lab.className = 'opt__label';
    lab.textContent = labelForValue(k);

    left.appendChild(cb);
    left.appendChild(lab);

    const count = document.createElement('div');
    count.className = 'opt__count';
    count.textContent = fmtInt(counts.get(k) || 0);

    row.appendChild(left);
    row.appendChild(count);

    wrap.appendChild(row);
  }

  container.innerHTML = '';
  container.appendChild(wrap);
}

function hashKey(s){
  let h = 0;
  for(const ch of String(s)) h = ((h<<5)-h) + ch.charCodeAt(0);
  return Math.abs(h);
}

function openModal(modal){
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
}

function closeModal(modal){
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
}

export function initFilters({ mountEl, allFeatures, onFiltered }){
  const features = Array.isArray(allFeatures) ? allFeatures : [];
  const areaBins = computeAreaBins(features);
  const defs = defaultDefs(areaBins);

  // state: Map<filterId, Set<key>>
  const state = new Map();
  for(const d of defs) state.set(d.id, new Set());

  // DOM
  const modal = document.getElementById('filter-modal');
  const elTitle = document.getElementById('filter-modal-title');
  const elSearch = document.getElementById('filter-modal-search');
  const elMeta = document.getElementById('filter-modal-meta');
  const elBody = document.getElementById('filter-modal-body');
  const btnClear = document.getElementById('filter-modal-clear');
  const btnApply = document.getElementById('filter-modal-apply');

  let activeDef = null;
  let tempSelected = new Set();

  function updateBadges(){
    for(const d of defs){
      const btn = mountEl?.querySelector?.(`[data-filter-id="${d.id}"]`);
      if(!btn) continue;
      const n = state.get(d.id)?.size || 0;
      let badge = btn.querySelector('.actionbtn__badge');
      if(n > 0){
        if(!badge){
          badge = document.createElement('span');
          badge.className = 'actionbtn__badge';
          btn.appendChild(badge);
        }
        badge.textContent = String(n);
      }else{
        badge?.remove();
      }
    }
  }

  function applyAndNotify(){
    const filtered = features.filter(f => matchFeature(defs, f, state));
    updateBadges();
    onFiltered?.({ filteredFeatures: filtered, state, defs });
  }

  function buildButtons(){
    if(!mountEl) return;
    mountEl.innerHTML = '';

    for(const d of defs){
      const b = document.createElement('button');
      b.className = 'actionbtn';
      b.type = 'button';
      b.title = d.label;
      b.setAttribute('aria-label', d.label);
      b.dataset.filterId = d.id;
      b.innerHTML = `<i class="bi ${d.icon}" aria-hidden="true"></i>`;
      b.addEventListener('click', () => openFilter(d.id));
      mountEl.appendChild(b);
    }

    const reset = document.createElement('button');
    reset.className = 'actionbtn actionbtn--reset';
    reset.type = 'button';
    reset.title = 'Reset filtri';
    reset.setAttribute('aria-label', 'Reset filtri');
    reset.innerHTML = `<i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i>`;
    reset.addEventListener('click', () => {
      for(const d of defs) state.get(d.id).clear();
      applyAndNotify();
    });
    mountEl.appendChild(reset);
  }

  function openFilter(filterId){
    activeDef = defs.find(d => d.id === filterId);
    if(!activeDef) return;

    // selezione temporanea = copia
    tempSelected = new Set(state.get(activeDef.id) || []);

    // counts faceted: applica tutti tranne questo filtro
    const base = features.filter(f => matchFeature(defs, f, state, activeDef.id));
    const counts = countsForDef(activeDef, base);

    // titolo + meta
    if(elTitle) elTitle.textContent = activeDef.label;
    if(elMeta) elMeta.textContent = `${fmtInt(base.length)} record`;
    if(elSearch) elSearch.value = '';

    renderModalList({ container: elBody, def: activeDef, counts, selected: tempSelected, query: '' });
    openModal(modal);
  }

  // close modal handlers
  if(modal){
    modal.addEventListener('click', (e) => {
      const t = e.target;
      if(t && t.closest && t.closest('[data-modal-close]')){
        closeModal(modal);
      }
    });
  }
  document.addEventListener('keydown', (e) => {
    if(e.key === 'Escape') closeModal(modal);
  });

  // modal events
  if(elSearch){
    elSearch.addEventListener('input', () => {
      if(!activeDef) return;
      const base = features.filter(f => matchFeature(defs, f, state, activeDef.id));
      const counts = countsForDef(activeDef, base);
      renderModalList({ container: elBody, def: activeDef, counts, selected: tempSelected, query: elSearch.value });
    });
  }

  if(btnClear){
    btnClear.addEventListener('click', () => {
      tempSelected.clear();
      // rerender list, mantenendo query
      if(!activeDef) return;
      const base = features.filter(f => matchFeature(defs, f, state, activeDef.id));
      const counts = countsForDef(activeDef, base);
      renderModalList({ container: elBody, def: activeDef, counts, selected: tempSelected, query: elSearch?.value || '' });
    });
  }

  if(btnApply){
    btnApply.addEventListener('click', () => {
      if(!activeDef) return;
      state.set(activeDef.id, new Set(tempSelected));
      closeModal(modal);
      applyAndNotify();
    });
  }

  buildButtons();
  applyAndNotify();

  return {
    defs,
    state,
    apply: applyAndNotify,
  };
}
