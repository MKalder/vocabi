const API_URL = 'https://api.prodowner.de/translate';
const API_BASE = 'https://api.prodowner.de';

// ── CSS für Highlighting + Spinner injizieren ─────────────────
const vocabiStyle = document.createElement('style');
vocabiStyle.textContent = `
  .vocabi-highlight {
    background: rgba(79, 70, 229, 0.15);
    border-bottom: 2px solid #4F46E5;
    border-radius: 2px;
    cursor: pointer;
    transition: background 0.2s;
  }
  .vocabi-highlight:hover {
    background: rgba(79, 70, 229, 0.3);
  }

  @keyframes vocabi-spin {
    to { transform: rotate(360deg); }
  }

  .vocabi-spinner {
    width: 20px;
    height: 20px;
    border: 2px solid rgba(255,255,255,0.2);
    border-top-color: #a5b4fc;
    border-radius: 50%;
    animation: vocabi-spin 0.7s linear infinite;
    margin: 0 auto;
  }

  .vocabi-result {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .vocabi-result-word {
    font-size: 15px;
    font-weight: 600;
    color: #f0f0f0;
  }

  .vocabi-result-translation {
    color: #a5b4fc;
    font-size: 14px;
  }

  .vocabi-result-divider {
    border: none;
    border-top: 1px solid rgba(255,255,255,0.1);
    margin: 4px 0;
  }

  .vocabi-result-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #6b7280;
    margin-bottom: 2px;
  }

  .vocabi-result-text {
    font-size: 13px;
    color: #d1d5db;
    line-height: 1.5;
  }
`;
document.head.appendChild(vocabiStyle);

// ── Icon ──────────────────────────────────────────────────────
const icon = document.createElement('div');
icon.style.cssText = `
  position: absolute;
  width: 28px;
  height: 28px;
  background: #4F46E5;
  border-radius: 50%;
  cursor: pointer;
  display: none;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  z-index: 999999;
  user-select: none;
  color: white;
`;
icon.textContent = 'V';
document.body.appendChild(icon);

// ── Tooltip ───────────────────────────────────────────────────
const tooltip = document.createElement('div');
tooltip.style.cssText = `
  position: absolute;
  background: #1e1e1e;
  color: #f0f0f0;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.6;
  max-width: 320px;
  min-width: 180px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  z-index: 999999;
  display: none;
  font-family: sans-serif;
`;
document.body.appendChild(tooltip);

let iconTimeout = null;
let savedSelection = null;

// ── Icon anzeigen ─────────────────────────────────────────────
function showIcon(rect) {
  icon.style.left = `${rect.right + window.scrollX + 8}px`;
  icon.style.top = `${rect.bottom + window.scrollY - 28}px`;
  icon.style.display = 'flex';

  clearTimeout(iconTimeout);
  iconTimeout = setTimeout(() => {
    icon.style.display = 'none';
  }, 3000);
}

// ── Fehler anzeigen ───────────────────────────────────────────
function showError(message, rect) {
  tooltip.style.left = `${rect.right + window.scrollX + 8}px`;
  tooltip.style.top = `${rect.bottom + window.scrollY + 8}px`;
  tooltip.textContent = message;
  tooltip.style.display = 'block';

  setTimeout(() => {
    tooltip.style.display = 'none';
  }, 2000);
}

// ── Spinner anzeigen ──────────────────────────────────────────
function showSpinner(rect) {
  tooltip.style.left = `${rect.left + window.scrollX}px`;
  tooltip.style.top = `${rect.bottom + window.scrollY + 10}px`;
  tooltip.innerHTML = '<div class="vocabi-spinner"></div>';
  tooltip.style.display = 'block';
}

// ── Strukturiertes Ergebnis anzeigen ──────────────────────────
function showResult(data, word) {
  tooltip.innerHTML = `
    <div class="vocabi-result">
      <div class="vocabi-result-word">${word}</div>
      <div class="vocabi-result-translation">${data.translation || '–'}</div>
      <hr class="vocabi-result-divider">
      <div class="vocabi-result-label">Bedeutung</div>
      <div class="vocabi-result-text">${data.meaning || '–'}</div>
      <div class="vocabi-result-label" style="margin-top:6px">Beispiel</div>
      <div class="vocabi-result-text">${data.example || '–'}</div>
      <div class="vocabi-result-label" style="margin-top:6px">Tipp</div>
      <div class="vocabi-result-text">${data.tip || '–'}</div>
    </div>
  `;
}

// ── SSE auf Job-Ergebnis warten ───────────────────────────────
function waitForResult(jobId, rect, word) {
  showSpinner(rect);

  const eventSource = new EventSource(`${API_URL}/stream/${jobId}`);

  eventSource.onmessage = (e) => {
    const data = JSON.parse(e.data);
    eventSource.close();

    if (data.status === 'done') {
      showResult(data, word);
      chrome.runtime.sendMessage({ action: 'vocabAdded' });
      refreshVocabCache();
    } else {
      tooltip.textContent = 'Error while translating.';
    }
  };

  eventSource.onerror = () => {
    eventSource.close();
    tooltip.textContent = 'Connection error.';
  };
}

// ── Selektion validieren ──────────────────────────────────────
function analyzeSelection(text) {
  const words = text.trim().split(/\s+/);
  const wordCount = words.length;

  if (text.length < 2) return { valid: false, reason: 'Too short.' };
  if (/^\d+$/.test(text)) return { valid: false, reason: 'No pure numbers.' };
  if (wordCount > 7) return { valid: false, reason: 'Max 7 words allowed.' };

  return {
    valid: true,
    type: wordCount === 1 ? 'vocabulary' : 'phrase'
  };
}

// ── Satzkontext aus DOM extrahieren ───────────────────────────
function extractContext(range) {
  const text = range.startContainer.textContent || '';
  const sentences = text.match(/[^.!?]+[.!?]*/g) || [text];
  const selected = range.toString();
  return (sentences.find(s => s.includes(selected)) || '').trim();
}

// ── POST an API senden ────────────────────────────────────────
async function sendToAPI(selection) {
  const { text, type, context, rect } = selection;

  const stored = await chrome.storage.local.get('targetLang');
  const targetLang = stored.targetLang || 'english';

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        type,
        context,
        targetLang,
        sourceUrl: window.location.href
      })
    });
    const data = await res.json();
    // text als word mitgeben damit showResult das Wort anzeigen kann
    waitForResult(data.jobId, rect, text);
  } catch (err) {
    tooltip.style.display = 'block';
    tooltip.textContent = 'Error sending request.';
  }
}

// ── Alle Highlights entfernen ─────────────────────────────────
function removeAllHighlights() {
  document.querySelectorAll('.vocabi-highlight').forEach(mark => {
    const text = document.createTextNode(mark.textContent);
    mark.parentNode.replaceChild(text, mark);
  });
}

// ── Word Highlighting ─────────────────────────────────────────
function highlightVocabOnPage(cards) {
  if (!cards || cards.length === 0) return;

  const vocab = {};
  cards.forEach(card => {
    if (card.front) {
      vocab[card.front.toLowerCase().trim()] = card;
    }
  });

  const keys = Object.keys(vocab);
  if (keys.length === 0) return;

  const escaped = keys.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;

        const skip = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'CODE', 'PRE'];
        if (skip.includes(parent.tagName)) return NodeFilter.FILTER_REJECT;

        if (parent.classList.contains('vocabi-highlight')) return NodeFilter.FILTER_REJECT;
        if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT;

        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) {
    regex.lastIndex = 0;
    if (regex.test(node.textContent)) {
      textNodes.push(node);
    }
  }

  textNodes.forEach(textNode => {
    const text = textNode.textContent;
    regex.lastIndex = 0;
    if (!regex.test(text)) return;
    regex.lastIndex = 0;

    const wrapper = document.createElement('span');
    wrapper.innerHTML = text.replace(regex, (match) => {
      const card = vocab[match.toLowerCase().trim()];
      if (!card) return match;
      return `<mark
        class="vocabi-highlight"
        data-vocab-id="${card.id}"
        data-vocab-front="${card.front}"
        data-vocab-back="${card.back || ''}"
        data-vocab-meaning="${(card.note || '').replace(/"/g, '&quot;')}"
      >${match}</mark>`;
    });

    textNode.parentNode.replaceChild(wrapper, textNode);
  });
}

// ── Hover-Tooltip für Highlights ─────────────────────────────
document.addEventListener('mouseover', (e) => {
  const mark = e.target.closest('.vocabi-highlight');
  if (!mark) return;

  const front = mark.dataset.vocabFront;
  const back = mark.dataset.vocabBack;
  const meaning = mark.dataset.vocabMeaning;

  tooltip.innerHTML = `
    <div class="vocabi-result">
      <div class="vocabi-result-word">${front}</div>
      <div class="vocabi-result-translation">${back}</div>
      ${meaning ? `
        <hr class="vocabi-result-divider">
        <div class="vocabi-result-label">Bedeutung</div>
        <div class="vocabi-result-text">${meaning}</div>
      ` : ''}
    </div>
  `;
  tooltip.style.left = `${e.pageX + 12}px`;
  tooltip.style.top = `${e.pageY + 12}px`;
  tooltip.style.display = 'block';
});

document.addEventListener('mouseout', (e) => {
  const mark = e.target.closest('.vocabi-highlight');
  if (mark && !e.relatedTarget?.closest('.vocabi-highlight')) {
    tooltip.style.display = 'none';
  }
});

// ── Highlighting initialisieren ───────────────────────────────
async function initHighlighting() {
  const settings = await chrome.storage.local.get(['vocabCache', 'highlightEnabled']);
  const enabled = settings.highlightEnabled !== false;

  if (!enabled) return;

  if (settings.vocabCache && settings.vocabCache.length > 0) {
    highlightVocabOnPage(settings.vocabCache);
  }
}

// ── Cache nach neuer Übersetzung aktualisieren ────────────────
async function refreshVocabCache() {
  try {
    const settings = await chrome.storage.local.get('highlightEnabled');
    const enabled = settings.highlightEnabled !== false;

    const res = await fetch(`${API_BASE}/vocabulary`);
    const vocab = await res.json();

    const cards = vocab.map(row => ({
      id: row.id,
      front: row.input_text,
      back: row.translation || '',
      note: row.meaning || '',
      language: row.target_lang
    }));

    await chrome.storage.local.set({ vocabCache: cards });

    if (!enabled) return;

    removeAllHighlights();
    highlightVocabOnPage(cards);
  } catch (err) {
    console.error('VocAbi: Cache refresh fehlgeschlagen', err);
  }
}

// ── Event Listener: Maus-Selektion ───────────────────────────
document.addEventListener('mouseup', (e) => {
  if (icon.contains(e.target)) return;
  if (e.target.closest('.vocabi-highlight')) return;

  const selectedText = window.getSelection().toString().trim();

  if (!selectedText) {
    icon.style.display = 'none';
    return;
  }

  const selection = window.getSelection();
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  const analysis = analyzeSelection(selectedText);

  if (!analysis.valid) {
    showError(analysis.reason, rect);
    return;
  }

  const context = extractContext(range);

  savedSelection = {
    text: selectedText,
    type: analysis.type,
    context,
    rect
  };

  showIcon(rect);
});

// ── Event Listener: Icon-Klick ────────────────────────────────
icon.addEventListener('click', () => {
  if (!savedSelection) return;
  icon.style.display = 'none';
  clearTimeout(iconTimeout);
  sendToAPI(savedSelection);
});

// ── Event Listener: Messages ──────────────────────────────────
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'translate') {
    if (!savedSelection) return;
    sendToAPI(savedSelection);
    return;
  }

  if (message.action === 'setHighlight') {
    if (message.enabled) {
      initHighlighting();
    } else {
      removeAllHighlights();
    }
    return;
  }
});

// ── Event Listener: Klick außerhalb schließt UI ───────────────
document.addEventListener('mousedown', (e) => {
  if (
    !icon.contains(e.target) &&
    !tooltip.contains(e.target) &&
    !e.target.closest('.vocabi-highlight')
  ) {
    icon.style.display = 'none';
    tooltip.style.display = 'none';
  }
});

// ── Start ─────────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initHighlighting);
} else {
  initHighlighting();
}