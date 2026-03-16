export async function loadGeoJSON(url){
  const res = await fetch(url);
  if(!res.ok) throw new Error(`Impossibile caricare ${url} (${res.status})`);
  return await res.json();
}

export function romanToInt(roman){
  if(!roman) return null;
  const r = String(roman).trim().toUpperCase();
  const map = {I:1, V:5, X:10, L:50, C:100, D:500, M:1000};
  let total = 0;
  let prev = 0;
  for(let i=r.length-1;i>=0;i--){
    const v = map[r[i]];
    if(!v) return null;
    if(v < prev) total -= v; else total += v;
    prev = v;
  }
  return total;
}

export function parseCSVListField(value){
  if(value==null) return [];
  return String(value)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

export function parseDimsArea(value){
  if(value==null) return null;
  const s = String(value).toLowerCase().replace(/\s/g,'');
  const parts = s.split(/x|×/);
  if(parts.length < 2) return null;
  const w = Number(parts[0]);
  const h = Number(parts[1]);
  if(!Number.isFinite(w) || !Number.isFinite(h)) return null;
  return { w, h, area: w*h };
}

/**
 * Compat alias: charts.js usa parseDimensionsArea() (storico).
 * Ritorna solo l'area (cm²) oppure null.
 */
export function parseDimensionsArea(value){
  const parsed = parseDimsArea(value);
  return parsed ? parsed.area : null;
}

/** Compat alias: charts.js usa midYearFromRange() */
export function midYearFromRange(start, end){
  return midYear(start, end);
}

/**
 * Binning temporale (50 anni) per il grafico area.
 * Input: array di oggetti che hanno almeno { mid: number, area: number }.
 * Output: { labels: string[], values: number[] } dove values = area media per bin.
 */
export function bins50Years(rows){
  const bins = new Map(); // key = binStart
  for(const r of rows || []){
    const mid = Number(r.mid);
    const area = Number(r.area);
    if(!Number.isFinite(mid) || !Number.isFinite(area)) continue;

    // Math.floor gestisce anche BCE (negativi) in modo consistente.
    const binStart = Math.floor(mid / 50) * 50;
    const cur = bins.get(binStart) || { sum: 0, count: 0 };
    cur.sum += area;
    cur.count += 1;
    bins.set(binStart, cur);
  }

  const keys = [...bins.keys()].sort((a,b)=>a-b);
  const labels = keys.map(k => {
    const end = k + 49;
    return `${formatYear(k)}–${formatYear(end)}`;
  });
  const values = keys.map(k => {
    const { sum, count } = bins.get(k);
    return count ? Math.round(sum / count) : 0;
  });

  return { labels, values };
}

export function safeText(v){
  if(v==null) return '';
  return String(v);
}

export function formatYear(y){
  if(y==null || !Number.isFinite(Number(y))) return '—';
  const n = Number(y);
  if(n < 0) return `${Math.abs(n)} a.C.`;
  if(n === 0) return '0';
  return `${n} d.C.`;
}

export function midYear(start, end){
  const a = Number(start);
  const b = Number(end);
  if(!Number.isFinite(a) && !Number.isFinite(b)) return null;
  if(Number.isFinite(a) && !Number.isFinite(b)) return a;
  if(!Number.isFinite(a) && Number.isFinite(b)) return b;
  return Math.round((a+b)/2);
}

export function countBy(items, keyFn){
  const m = new Map();
  for(const it of items){
    const k = keyFn(it);
    if(k==null) continue;
    m.set(k, (m.get(k)||0)+1);
  }
  return m;
}

export function topKFromMap(m, k=3){
  return [...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,k);
}

export function percent(n, total){
  if(!total) return '0%';
  return `${Math.round((n/total)*100)}%`;
}

export function clamp(v, a, b){
  return Math.max(a, Math.min(b, v));
}

export const palettes = {
  neon: [
    '#00d5ff','#ff2bd6','#29ff7a','#d8ff1a','#7c4dff','#ff8c00','#00ffea','#ff4d6d','#00aaff','#b6ff00'
  ],
  aqua: [
    '#44a9ff','#00d5ff','#00aaff','#008cff','#66ffd1','#00ffa8','#2ad1ff','#7ab6ff'
  ]
};

export function languageColor(lang){
  const l = String(lang||'').toLowerCase();
  if(l.includes('mess')) return 'var(--acid-yellow)';
  if(l.includes('gre')) return 'var(--electric-green)';
  return 'var(--cyan)';
}
