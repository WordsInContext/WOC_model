import { languageColor } from './utils.js';

/**
 * Inizializza Leaflet senza basemap.
 */
export function initMap({ provinces, inscriptions, onSelectFeatures, onStatus }){
  const map = L.map('map', {
    zoomControl: false,
    minZoom: 6,
    maxZoom: 18,          // ✅ fondamentale senza tile layer (per markercluster)
    preferCanvas: true,

    // Zoom meno "a scatti" (mousewheel / trackpad)
    zoomSnap: 0.5,
    zoomDelta: 0.5,
    wheelPxPerZoomLevel: 180,
  });

  // View di default: Puglia (fallback se fitBounds non funziona)
  map.setView([40.8, 17.3], 7);

  // --- PANES (ordine grafico): province sotto, poi punti, poi cluster ---
  map.createPane('provincePane');
  map.getPane('provincePane').style.zIndex = 200;

  map.createPane('pointsPane');
  map.getPane('pointsPane').style.zIndex = 450;

  map.createPane('clustersPane');
  map.getPane('clustersPane').style.zIndex = 460;

  // --- Province layer (opzionale) ---
  let provincesLayer = null;
  if(Array.isArray(provinces?.features) && provinces.features.length){
    provincesLayer = L.geoJSON(provinces, {
      pane: 'provincePane',
      style: {
        color: '#00d5ff',
        weight: 2,
        opacity: 0.92,
        fillColor: '#030b12',
        fillOpacity: 0.85,
      },
      onEachFeature: (f, layer) => {
        const n =
          f?.properties?.Name ||
          f?.properties?.name ||
          f?.properties?.provincia ||
          f?.properties?.DEN_UTS ||
          'Provincia';

        layer.bindTooltip(String(n), { sticky: true, direction: 'auto', opacity: 0.85 });
      }
    }).addTo(map);

    try{
      const b = provincesLayer.getBounds();
      if(b && b.isValid && b.isValid()){
        map.fitBounds(b, { padding: [10, 10], animate: false });
      }
    }catch(_){ /* ignore */ }
  }

  // --- Marker cluster group ---
  const cluster = L.markerClusterGroup({
    pane: 'clustersPane',
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true,
    maxClusterRadius: 42,
    // ✅ evita warning/edge-case: senza tile layer il maxZoom va dichiarato (lo abbiamo)
    // opzionale: sciogli i cluster a zoom max
    disableClusteringAtZoom: map.getMaxZoom(),
    iconCreateFunction: (cl) => createClusterIcon(cl),
  });

  let markers = [];

  // Click su cluster: niente zoom automatico, mostriamo schede
  cluster.on('clusterclick', (e) => {
    // blocca comportamento default (zoom-to-bounds)
    e.originalEvent?.preventDefault?.();
    e.originalEvent?.stopPropagation?.();

    const childMarkers = e.layer.getAllChildMarkers();
    const feats = childMarkers.map(m => m.__feature).filter(Boolean);

    onSelectFeatures?.(feats);
    highlightSelection(childMarkers);

    // centra sul cluster
    try{
      map.panTo(e.layer.getLatLng(), { animate: true });
    }catch(_){ /* ignore */ }
  });

  map.addLayer(cluster);

  function clearSelection(){
    highlightSelection([]);
  }

  function setInscriptions(data){
    // data puo essere: array di feature, oppure FeatureCollection
    const feats = Array.isArray(data) ? data : (data?.features || []);

    // reset layers
    cluster.clearLayers();
    markers = [];
    clearSelection();
    onSelectFeatures?.([]);

    for(const feat of feats){
      if(!feat?.geometry || feat.geometry.type !== 'Point') continue;

      const coords = feat.geometry.coordinates || [];
      const lng = Number(coords[0]);
      const lat = Number(coords[1]);
      if(!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      const lang = String(feat?.properties?.lingua || '').toLowerCase();
      const kind = lang.includes('mess') ? 'messapico' : 'greco';

      const marker = L.marker([lat, lng], {
        pane: 'pointsPane',
        icon: createPointIcon(kind),
        riseOnHover: true,
        keyboard: false,
      });

      marker.__feature = feat;

      marker.on('click', () => {
        onSelectFeatures?.([feat]);
        highlightSelection([marker]);
      });

      markers.push(marker);
      cluster.addLayer(marker);
    }

    // Status HUD
    const provCount = provincesLayer ? countProvinces(provinces) : 0;
    onStatus?.(provCount ? `Caricati: ${markers.length} punti · ${provCount} province` : `Caricati: ${markers.length} punti`);
  }

  // iniziale
  setInscriptions(inscriptions);

  return {
    map,
    cluster,
    setStatus: (s) => onStatus?.(s),
    setInscriptions,
    clearSelection,
  };
}

let lastSelectedEls = [];
function highlightSelection(markerList){
  // rimuovi highlight precedente
  for(const el of lastSelectedEls){
    el.classList.remove('is-selected');
  }
  lastSelectedEls = [];

  // aggiungi highlight nuovo
  for(const m of markerList || []){
    const el = m.getElement?.();
    if(el){
      el.classList.add('is-selected');
      lastSelectedEls.push(el);
    }
  }
}

function createPointIcon(kind){
  const cls = kind === 'messapico' ? 'inscription-dot--messapico' : 'inscription-dot--greco';
  const html = `<div class="inscription-dot ${cls}" aria-hidden="true"></div>`;

  return L.divIcon({
    html,
    className: 'inscription-marker',
    iconSize: [18,18],
    iconAnchor: [9,9],
  });
}

function createClusterIcon(cluster){
  const children = cluster.getAllChildMarkers();
  let g = 0, m = 0;

  for(const ch of children){
    const lang = String(ch.__feature?.properties?.lingua || '').toLowerCase();
    if(lang.includes('mess')) m++;
    else if(lang.includes('gre')) g++;
  }

  const total = children.length;

  // Cluster come "pallino" (stesso stile dei marker) + callout a "L" con conteggio.
  const cls = m > g ? 'clusterDot--messapico' : (g > m ? 'clusterDot--greco' : 'clusterDot--mix');
  const size = clusterDotSize(total);

  // L'icona deve includere anche il callout (a destra/basso). L'ancora resta al centro del pallino.
  // include callout piu lungo + label piu distante
  const iconW = size + 92;
  const iconH = size + 46;

  const html = `
    <div class="clusterDot ${cls}" style="--s:${size}px">
      <div class="clusterDot__dot" aria-hidden="true"></div>
      <div class="clusterDot__call" aria-hidden="true">
        <div class="clusterDot__h"></div>
        <div class="clusterDot__v"></div>
        <div class="clusterDot__label">${total}</div>
      </div>
    </div>
  `;

  return L.divIcon({
    html,
    className: 'cluster-wrap',
    iconSize: [iconW, iconH],
    iconAnchor: [Math.round(size/2), Math.round(size/2)]
  });
}

function clusterDotSize(total){
  // Crescita dolce (logaritmica) + clamp
  const t = Math.max(2, Number(total) || 2);
  const s = Math.round(16 + 5 * Math.log2(t)); // 2->21, 8->31, 32->41
  return Math.max(18, Math.min(42, s));
}

function countProvinces(prov){
  const feats = prov?.features || [];
  return feats.filter(f => f?.geometry).length;
}
