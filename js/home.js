import { loadGeoJSON } from './utils.js';
import { loadImagesIndex } from './images-store.js';

const PATHS = {
  iscrizioni: './data/iscrizioni.geojson',
  immagini: './data/images.json',
  province: './province.geojson'
};

async function boot() {
  try {
    const [geo, imagesIndex, provinceGeo] = await Promise.all([
      loadGeoJSON(PATHS.iscrizioni),
      loadImagesIndex(PATHS.immagini).catch(() => ({ rows: [], byObject: new Map(), byId: new Map() })),
      loadGeoJSON(PATHS.province)
    ]);

    const features = (geo?.features || []).filter(Boolean);
    const props = features.map(f => f.properties || {});

    const provinceCounts = countBy(props, 'provincia');
    const languageCounts = countBy(props, 'lingua');
    const minYear = minNumeric(props.map(p => p.datazione_inizio));
    const maxYear = maxNumeric(props.map(p => p.datazione_fine));

    setText('stat-epigrafi', formatInt(features.length));
    setText('stat-immagini', formatInt(imagesIndex.rows.length));
    setText('stat-province', formatInt(provinceCounts.length));
    setText('stat-arco', formatRange(minYear, maxYear));
    setText('count-greco', `${formatInt(valueFor(languageCounts, 'greco'))} record`);
    setText('count-messapico', `${formatInt(valueFor(languageCounts, 'messapico'))} record`);

    renderTimeline(props);
    renderProvincePreview(provinceGeo, provinceCounts);
    initSectionSpy();
  } catch (err) {
    console.error(err);
    initSectionSpy();
  }
}

function renderTimeline(props) {
  const mount = document.getElementById('timeline-branches');
  if (!mount) return;

  const periods = [
    { label: 'Arcaico', range: 'fino a 480 a.C.', test: p => num(p.datazione_inizio) <= -480 },
    { label: 'Classico', range: '480–400 a.C.', test: p => num(p.datazione_inizio) > -480 && num(p.datazione_inizio) <= -400 },
    { label: 'Tardo Classico', range: '400–325 a.C.', test: p => num(p.datazione_inizio) > -400 && num(p.datazione_inizio) <= -325 },
    { label: 'Ellenistico', range: '325–25 a.C.', test: p => num(p.datazione_inizio) > -325 && num(p.datazione_inizio) <= -150 },
  ];

  const rows = periods.map((period, index) => ({
    ...period,
    index,
    value: props.filter(period.test).length
  }));

  const max = Math.max(1, ...rows.map(r => r.value));

  mount.innerHTML = rows.map((row, index) => {
    const isTop = index % 2 === 1;
    const length = Math.round(scale(row.value, 0, max, 80, 170));
    const thickness = Math.round(scale(row.value, 0, max, 4, 14));
    return `
      <article class="timeline-branch ${isTop ? 'is-top' : 'is-bottom'}" style="--branch-length:${length}px; --branch-thickness:${thickness}px">
        <span class="timeline-branch__axis-dot"></span>
        <span class="timeline-branch__line"></span>
        <div class="timeline-branch__card">
          <div class="timeline-branch__phase">${escapeHTML(row.label)}</div>
          <strong class="timeline-branch__count">${formatInt(row.value)}</strong>
          <span class="timeline-branch__range">${escapeHTML(row.range)}</span>
        </div>
      </article>
    `;
  }).join('');
}

function renderProvincePreview(provinceGeo, provinceCounts) {
  const mount = document.getElementById('home-province-map');
  const legendMount = document.getElementById('home-province-legend');
  if (!mount || !window.L) return;

  const counts = new Map(provinceCounts.map(item => [normalizeJoin(item.label), item.value]));
  const values = [...counts.values()];
  const max = Math.max(1, ...values);

  const map = L.map(mount, {
    zoomControl: false,
    attributionControl: false,
    scrollWheelZoom: false
  });

  const layer = L.geoJSON(provinceGeo, {
    style: feature => {
      const rawName = feature?.properties?.Name || '';
      const value = counts.get(normalizeJoin(rawName)) || 0;
      return {
        color: '#5a6d76',
        weight: 1.3,
        fillColor: provinceColor(value, max),
        fillOpacity: value > 0 ? 0.92 : 0.4
      };
    },
    onEachFeature: (feature, lyr) => {
      const rawName = feature?.properties?.Name || 'Provincia';
      const value = counts.get(normalizeJoin(rawName)) || 0;
      lyr.bindTooltip(`<strong>${escapeHTML(rawName)}</strong><br>${formatInt(value)} epigrafi`, {
        sticky: true,
        className: 'home-map-tooltip'
      });
      lyr.on({
        mouseover: () => lyr.setStyle({ weight: 2.2, color: '#203848' }),
        mouseout: () => layer.resetStyle(lyr)
      });
    }
  }).addTo(map);

  const bounds = layer.getBounds();
  if (bounds.isValid()) {
    map.fitBounds(bounds, { padding: [20, 20] });
  }

  const legendHtml = `
    <div class="legend-scale">
      <strong>Densità epigrafica per provincia</strong>
      <div class="legend-swatches">
        <span style="background:#e8dfcf"></span>
        <span style="background:#d7c1a2"></span>
        <span style="background:#c8a577"></span>
        <span style="background:#b67f36"></span>
      </div>
      <div class="legend-labels">
        <span>0</span>
        <span>medio</span>
        <span>${formatInt(max)}</span>
      </div>
    </div>
  `;

  if (legendMount) legendMount.innerHTML = legendHtml;
}

function provinceColor(value, max) {
  if (!value) return '#e8dfcf';
  const t = value / Math.max(1, max);
  if (t <= 0.33) return '#d7c1a2';
  if (t <= 0.66) return '#c8a577';
  return '#b67f36';
}

function initSectionSpy() {
  const sections = [...document.querySelectorAll('.section-anchor')];
  const links = [...document.querySelectorAll('[data-home-nav]')];
  if (!sections.length || !links.length) return;

  const setActive = id => {
    links.forEach(link => {
      link.classList.toggle('is-active', link.getAttribute('data-home-nav') === id);
    });
  };

  const obs = new IntersectionObserver(entries => {
    const visible = entries
      .filter(entry => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (visible) setActive(visible.target.id);
  }, {
    rootMargin: '-32% 0px -45% 0px',
    threshold: [0.2, 0.4, 0.6]
  });

  sections.forEach(section => obs.observe(section));
}

function countBy(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const value = normalizeLabel(row?.[key]);
    if (!value) continue;
    map.set(value, (map.get(value) || 0) + 1);
  }
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function valueFor(entries, label) {
  return entries.find(item => normalizeJoin(item.label) === normalizeJoin(label))?.value || 0;
}

function minNumeric(values) {
  const nums = values.map(num).filter(Number.isFinite);
  return nums.length ? Math.min(...nums) : null;
}

function maxNumeric(values) {
  const nums = values.map(num).filter(Number.isFinite);
  return nums.length ? Math.max(...nums) : null;
}

function scale(value, inMin, inMax, outMin, outMax) {
  if (inMax <= inMin) return outMax;
  const ratio = (value - inMin) / (inMax - inMin);
  return outMin + ratio * (outMax - outMin);
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function formatRange(start, end) {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 'n.d.';
  return `${formatYear(start)} · ${formatYear(end)}`;
}

function formatYear(year) {
  const rounded = Math.round(year);
  if (rounded < 0) return `${Math.abs(rounded)} a.C.`;
  if (rounded > 0) return `${rounded} d.C.`;
  return '0';
}

function normalizeLabel(value) {
  const s = String(value || '').trim();
  return s ? s : '';
}

function normalizeJoin(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function formatInt(value) {
  return new Intl.NumberFormat('it-IT').format(Number(value || 0));
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function escapeHTML(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

boot();
