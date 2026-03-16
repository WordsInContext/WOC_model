import { romanToInt, parseDimensionsArea, midYearFromRange, bins50Years, palettes } from './utils.js';

let chartArg = null;
let chartFasi = null;
let chartArea = null;

function mustGet(id){
  const el = document.getElementById(id);
  if(!el){
    console.warn(`[charts] Elemento non trovato: #${id}`);
  }
  return el;
}

export function initCharts(){
  // Global Chart.js defaults for dark UI
  if(window.Chart){
    Chart.defaults.color = 'rgba(240,248,255,0.78)';
    Chart.defaults.borderColor = 'rgba(120,200,255,0.18)';
    Chart.defaults.font.family = 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial';
  }

  const cArg = mustGet('chart-argomenti');
  const cFasi = mustGet('chart-fasi');
  const cDim = mustGet('chart-dimensioni');

  // Se manca anche solo un canvas, evitiamo di creare chart (così niente crash)
  if(!cArg || !cFasi || !cDim) return;

  chartArg = new Chart(cArg, {
                              type: 'doughnut',
                              data: { labels: [], datasets: [{
                            data: [],
                            backgroundColor: [],
                            borderWidth: 2,
                            borderColor: 'rgba(6, 16, 28, 0.85)',
                            hoverOffset: 10,
                            spacing: 3,
                            borderRadius: 8
                          }]
                            },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '10%',      // foro centrale MOLTO piccolo (effetto "torta con nucleo")
        radius: '96%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const total = ctx.dataset.data.reduce((a,b)=>a+b,0) || 1;
                const val = ctx.parsed;
                const pct = Math.round((val/total)*100);
                return `${ctx.label}: ${val} (${pct}%)`;
              }
            }
          }
        }
      }
  });

  chartFasi = new Chart(cFasi, {
    data: {
      labels: [],
      datasets: [
        {
          type: 'bar',
          label: 'N. record',
          data: [],
          borderWidth: 0,
          backgroundColor: 'rgba(0,213,255,0.45)'
        },
        {
          type: 'line',
          label: 'Cumulativo',
          data: [],
          tension: 0.35,
          pointRadius: 2,
          borderWidth: 2,
          borderColor: 'rgba(68,169,255,0.95)',
          backgroundColor: 'rgba(68,169,255,0.12)'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } },
        y: { beginAtZero: true }
      }
    }
  });

  chartArea = new Chart(cDim, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Area media (cm²)',
        data: [],
        tension: 0.35,
        pointRadius: 2,
        borderWidth: 2,
        borderColor: 'rgba(41,255,122,0.9)',
        backgroundColor: 'rgba(41,255,122,0.12)'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } },
        y: { beginAtZero: true }
      }
    }
  });
}

export function updateCharts(features){
  // Se initCharts non ha creato i grafici (per canvas mancanti), esco pulito
  if(!chartArg || !chartFasi || !chartArea) return;

  const props = features.map(f => f.properties || {});

  // --- 1A Argomenti (csv in stringa) ---
  const argCounts = new Map();
  let argTotal = 0;
  for(const p of props){
    const raw = p.argomento;
    if(!raw) continue;
    const items = String(raw)
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    for(const it of items){
      argTotal += 1;
      argCounts.set(it, (argCounts.get(it) || 0) + 1);
    }
  }
  const argSorted = [...argCounts.entries()].sort((a,b) => b[1]-a[1]);
  const argLabels = argSorted.slice(0, 10).map(d => d[0]);
  const argValues = argSorted.slice(0, 10).map(d => d[1]);
  chartArg.data.datasets[0].backgroundColor =
  argLabels.map((_, i) => palettes.neon[i % palettes.neon.length]);
  chartArg.data.labels = argLabels;
  chartArg.data.datasets[0].data = argValues;
  chartArg.update();

  const topArg = argSorted.slice(0, 3).map(([k,v]) => {
    const pct = argTotal ? Math.round((v/argTotal)*100) : 0;
    return `${k} (${pct}%)`;
  });

  const elArgDesc = document.getElementById('desc-argomenti');
  if(elArgDesc){
    elArgDesc.innerHTML = summaryHTML([
      ['Record', String(features.length)],
      ['Valori argomento', String(argTotal)],
      ['Top', topArg.join('<br/>') || '—']
    ]);
  }

  // --- 1B Fasi (romani) ---
  const phaseCounts = new Map();
  for(const p of props){
    const r = p.fase;
    if(!r) continue;
    const key = String(r).trim().toUpperCase();
    phaseCounts.set(key, (phaseCounts.get(key) || 0) + 1);
  }
  const phaseSorted = [...phaseCounts.entries()]
    .map(([k,v]) => ({ k, v, n: romanToInt(k) ?? 9999 }))
    .sort((a,b) => a.n - b.n);

  const phaseLabels = phaseSorted.map(d => d.k);
  const phaseValues = phaseSorted.map(d => d.v);
  const phaseCum = [];
  let run = 0;
  for(const v of phaseValues){ run += v; phaseCum.push(run); }

  chartFasi.data.labels = phaseLabels;
  chartFasi.data.datasets[0].data = phaseValues;
  chartFasi.data.datasets[1].data = phaseCum;
  chartFasi.update();

  const mostPhase = phaseSorted.length ? phaseSorted.slice().sort((a,b)=>b.v-a.v)[0] : null;

  const elFasiDesc = document.getElementById('desc-fasi');
  if(elFasiDesc){
    elFasiDesc.innerHTML = summaryHTML([
      ['Fasi distinte', String(phaseSorted.length)],
      ['Piu frequente', mostPhase ? `${mostPhase.k} (${mostPhase.v})` : '—'],
      ['Copertura', phaseSorted.length ? `${phaseSorted[0].k} → ${phaseSorted[phaseSorted.length-1].k}` : '—']
    ]);
  }

  // --- 1C Area supporti (trend) ---
  const rows = [];
  for(const p of props){
    const area = parseDimensionsArea(p.supporto_dimensioni_cm);
    const mid = midYearFromRange(p.datazione_inizio, p.datazione_fine);
    if(area == null || mid == null) continue;
    rows.push({ mid, area, materiale: p.supporto_materiale, tipologia: p.supporto_tipologia, contesto: p.supporto_contesto });
  }

  const bins = bins50Years(rows);
  chartArea.data.labels = bins.labels;
  chartArea.data.datasets[0].data = bins.values;
  chartArea.update();

  const avgArea = rows.length ? Math.round(rows.reduce((s,r)=>s+r.area,0)/rows.length) : 0;
  const topMat = topK(rows.map(r=>r.materiale), 3);
  const topTip = topK(rows.map(r=>r.tipologia), 3);
  const topCon = topK(rows.map(r=>r.contesto), 3);

  const elDimDesc = document.getElementById('desc-dimensioni');
  if(elDimDesc){
    elDimDesc.innerHTML = summaryHTML([
      ['Record con area', String(rows.length)],
      ['Area media', rows.length ? `${avgArea.toLocaleString('it-IT')} cm²` : '—'],
      ['Materiali', topMat.join('<br/>') || '—'],
      ['Tipologie', topTip.join('<br/>') || '—'],
      ['Contesti', topCon.join('<br/>') || '—']
    ]);
  }
}

function summaryHTML(pairs){
  return pairs.map(([k,v]) => `
    <div class="kv">
      <div class="k">${escapeHTML(k)}</div>
      <div class="v">${v}</div>
    </div>
  `).join('');
}

function topK(values, k){
  const m = new Map();
  for(const v of values){
    const key = (v == null || String(v).trim()==='') ? '(n/d)' : String(v).trim();
    m.set(key, (m.get(key)||0)+1);
  }
  return [...m.entries()]
    .sort((a,b)=>b[1]-a[1])
    .slice(0,k)
    .map(([key,count])=> `${key} (${count})`);
}

function escapeHTML(s){
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;');
}
