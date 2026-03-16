// markup.js
// Rendering "clean": niente <> {} [], solo stile.
// Regole:
// - <...> = named entity (blu)
// - [...] = porzione incerta/integrazione (solo contenuto, giallo)
// - {...} = nota editoriale: NON si mostra nel testo, ma si aggancia al token precedente (underline + popover)

function tokenize(raw){
  const s = String(raw || '');
  const out = [];
  let i = 0;

  const pushText = (t) => { if(t) out.push({ type: 'text', value: t }); };

  while(i < s.length){
    const ch = s[i];
    const mode = ch === '<' ? 'entity' : ch === '[' ? 'uncertain' : ch === '{' ? 'note' : null;

    if(!mode){
      const j = nextSpecial(s, i);
      pushText(s.slice(i, j));
      i = j;
      continue;
    }

    const close = mode === 'entity' ? '>' : mode === 'uncertain' ? ']' : '}';
    const j = s.indexOf(close, i + 1);
    if(j === -1){
      pushText(s.slice(i));
      break;
    }

    const inner = s.slice(i + 1, j);
    out.push({ type: mode, value: inner });
    i = j + 1;
  }

  return out;
}

function nextSpecial(s, from){
  const a = s.indexOf('<', from);
  const b = s.indexOf('[', from);
  const c = s.indexOf('{', from);
  const arr = [a,b,c].filter(x => x !== -1);
  return arr.length ? Math.min(...arr) : s.length;
}

function splitKeepWS(str){
  // ritorna array alternando segmenti WS e non-WS
  // es: "hi  there" -> ["hi", "  ", "there"]
  const res = [];
  let cur = '';
  let ws = null;

  for(const ch of String(str)){
    const isWs = /\s/.test(ch);
    if(ws === null){
      ws = isWs;
      cur = ch;
    }else if(isWs === ws){
      cur += ch;
    }else{
      res.push(cur);
      cur = ch;
      ws = isWs;
    }
  }
  if(cur) res.push(cur);
  return res;
}

function isWhitespaceOnlyNode(n){
  return n && n.nodeType === 3 && /^\s+$/.test(n.nodeValue || '');
}

export function renderMarkedText(raw){
  const wrap = document.createElement('div');
  wrap.className = 'marked';

  const tokens = tokenize(raw);

  let currentWordEl = null; // parola corrente (tok)
  let lastWordEl = null;    // ultima parola renderizzata (anche se poi c’è spazio)

  const startWord = () => {
    if(currentWordEl) return currentWordEl;
    currentWordEl = document.createElement('span');
    currentWordEl.className = 'tok';
    wrap.appendChild(currentWordEl);
    lastWordEl = currentWordEl;
    return currentWordEl;
  };

  const endWord = () => {
    currentWordEl = null;
  };

  const appendSegment = (kind, text) => {
    const t = String(text ?? '');
    if(!t) return;
    const w = startWord();
    const seg = document.createElement('span');
    seg.className = `seg seg--${kind}`;
    seg.textContent = t;
    w.appendChild(seg);
  };

  const attachNote = (noteText) => {
    const note = String(noteText ?? '').trim();
    if(!note || !lastWordEl) return;

    if(!lastWordEl.__notes) lastWordEl.__notes = [];
    lastWordEl.__notes.push(note);

    // badge visibile (una sola; se già c'è, aggiorna il testo con count)
    let badge = lastWordEl.querySelector(':scope > .note-tag');
    if(!badge){
      badge = document.createElement('span');
      badge.className = 'note-tag';
      lastWordEl.appendChild(badge);
    }
    badge.textContent = lastWordEl.__notes.length > 1 ? `note ${lastWordEl.__notes.length}` : 'nota';

    lastWordEl.classList.add('tok--note');
  };

  for(const t of tokens){
    if(t.type === 'note'){
      attachNote(t.value);
      continue;
    }

    if(t.type === 'text'){
      const parts = splitKeepWS(t.value);
      for(const part of parts){
        if(/^\s+$/.test(part)){
          // whitespace = separatore di parola
          wrap.appendChild(document.createTextNode(part));
          endWord();
        }else{
          // testo normale = verde
          appendSegment('plain', part);
        }
      }
      continue;
    }

    if(t.type === 'entity'){
      // entità blu
      appendSegment('entity', String(t.value || '').trim());
      continue;
    }

    if(t.type === 'uncertain'){
      // integrazione gialla (si incolla alla parola corrente, es. [w]edihi)
      appendSegment('uncertain', String(t.value || ''));
      continue;
    }
  }

  return wrap;
}


/**
 * Click su una parola sottolineata (w--note) -> popover con le note.
 * Nessun blur, nessun toggle: il testo resta sempre leggibile.
 */
export function attachMarkupInteractions(rootEl, popoverEl){
  if(!rootEl) return;

  if(rootEl.__markupBound) return;
  rootEl.__markupBound = true;

  const hidePopover = () => {
    if(!popoverEl) return;
    popoverEl.classList.remove('is-open');
    popoverEl.style.left = '-9999px';
    popoverEl.style.top = '-9999px';
    popoverEl.__for = null;
  };

  document.addEventListener('keydown', (e) => {
    if(e.key === 'Escape') hidePopover();
  });

  document.addEventListener('click', (e) => {
    if(!popoverEl) return;
    if(popoverEl.classList.contains('is-open')){
      const insidePopover = popoverEl.contains(e.target);
      const insideRoot = rootEl.contains(e.target);
      if(!insidePopover && !insideRoot) hidePopover();
    }
  });

  rootEl.addEventListener('click', (e) => {
    const w = e.target?.closest?.('.tok--note');
    if(!w || !rootEl.contains(w)) return;

    e.preventDefault();
    e.stopPropagation();

    // toggle: se clicco lo stesso, chiudo
    if(popoverEl && popoverEl.__for === w && popoverEl.classList.contains('is-open')){
      hidePopover();
      return;
    }

    if(!popoverEl) return;

    const notes = Array.isArray(w.__notes) ? w.__notes : [];
    if(!notes.length) return;

    popoverEl.innerHTML = `
      <div class="pop__title">Annotazione</div>
      <div class="pop__code">${notes.map(n => escapeHTML(n)).join('<br/>')}</div>
      <div class="pop__hint">ESC per chiudere</div>
    `;

    const r = w.getBoundingClientRect();
    const x = r.left + (r.width / 2);
    const y = r.bottom + 8;

    popoverEl.style.left = `${Math.round(x)}px`;
    popoverEl.style.top  = `${Math.round(y)}px`;
    popoverEl.classList.add('is-open');
    popoverEl.__for = w;
  });

  if(popoverEl) hidePopover();
}

function escapeHTML(s){
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;');
}
