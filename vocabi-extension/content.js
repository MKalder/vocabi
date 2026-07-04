const API_URL = 'https://api.prodowner.de/translate';

// ── CSS für Highlighting injizieren ─────────────────────────
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
`;
document.head.appendChild(vocabiStyle);

// ── Icon ─────────────────────────────────────────────────────
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

// ── SSE auf Job-Ergebnis warten ───────────────────────────────
function waitForResult(jobId, rect) {
  tooltip.style.left = `${rect.left + window.scrollX}px`;
  tooltip.style.top = `${rect.bottom + window.scrollY + 10}px`;
  tooltip.textContent = 'Translating...';
  tooltip.style.display = 'block';

  const eventSource = new EventSource(`${API_URL}/stream/${jobId}`);

  eventSource.onmessage = (e) => {
    const data = JSON.parse(e.data);
    eventSource.close();
    tooltip.textContent = data.status === 'done' ? data.result : 'Error while translating.';

    // Dashboard informieren falls offen
    if (data.status === 'done') {
      chrome.runtime.sendMessage({ action: 'vocabAdded' });
      // Cache aktualisieren damit Highlighting sofort greift
      refreshVocabCache();
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
    waitForResult(data.jobId, rect);
  } catch (err) {
    tooltip.style.display = 'block';
    tooltip.textContent = 'Error sending request.';
  }
}

// ── Word Highlighting ─────────────────────────────────────────

function highlightVocabOnPage(cards) {
  if (!cards || cards.length === 0) return;

  // Wörterbuch aufbauen: "speech" → card Objekt
  const vocab = {};
  cards.forEach(card => {
    if (card.front) {
      vocab[card.front.toLowerCase().trim()] = card;
    }
  });

  const keys = Object.keys(vocab);
  if (keys.length === 0) return;

  // Regex: alle Vokabeln als ganze Wörter matchen, case-insensitive
  // Sonderzeichen escapen damit Phrasen wie "kick the bucket" funktionieren
  const escaped = keys.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');

  // TreeWalker — geht nur durch reine Text-Nodes, kein HTML
  // Das ist wichtig weil innerHTML.replace() Script-Tags und Event-Listener zerstören würde
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;

        // Diese Elemente überspringen
        const skip = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'CODE', 'PRE'];
        if (skip.includes(parent.tagName)) return NodeFilter.FILTER_REJECT;

        // Unsere eigenen Highlights nicht nochmal highlighten
        if (parent.classList.contains('vocabi-highlight')) return NodeFilter.FILTER_REJECT;

        // Leere Nodes überspringen
        if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT;

        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  // Alle passenden Text-Nodes sammeln (nicht während des Walks ersetzen — das bricht den Walker)
  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) {
    if (regex.test(node.textContent)) {
      textNodes.push(node);
    }
    regex.lastIndex = 0;
  }

  // Text-Nodes ersetzen
  textNodes.forEach(textNode => {
    const text = textNode.textContent;
    regex.lastIndex = 0;

    if (!regex.test(text)) return;
    regex.lastIndex = 0;

    // Wrapper-Span erstellen
    const wrapper = document.createElement('span');
    wrapper.innerHTML = text.replace(regex, (match) => {
      const card = vocab[match.toLowerCase().trim()];
      if (!card) return match;
      // data-Attribute für Tooltip beim Hover
      return `<mark 
        class="vocabi-highlight" 
        data-vocab-id="${card.id}"
        data-vocab-front="${card.front}"
        data-vocab-back="${card.back || ''}"
        data-vocab-meaning="${(card.note || '').replace(/"/g, '&quot;')}"
      >${match}</mark>`;
    });

    // Original Text-Node durch Wrapper ersetzen
    textNode.parentNode.replaceChild(wrapper, textNode);
  });
}

// ── Tooltip für Highlights ─────────────────────────────────────
document.addEventListener('mouseover', (e) => {
  const mark = e.target.closest('.vocabi-highlight');
  if (!mark) return;

  const front = mark.dataset.vocabFront;
  const back = mark.dataset.vocabBack;
  const meaning = mark.dataset.vocabMeaning;

  tooltip.innerHTML = `
    <strong style="font-size:15px">${front}</strong><br>
    <span style="color:#a5b4fc">${back}</span>
    ${meaning ? `<br><span style="font-size:12px;color:#9ca3af;margin-top:4px;display:block">${meaning}</span>` : ''}
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

// ── Cache laden und Highlighting starten ──────────────────────
async function initHighlighting() {
  const cached = await chrome.storage.local.get('vocabCache');
  if (cached.vocabCache && cached.vocabCache.length > 0) {
    highlightVocabOnPage(cached.vocabCache);
  }
}

// Cache nach neuer Übersetzung aktualisieren und Highlighting neu starten
async function refreshVocabCache() {
  try {
    const res = await fetch(`${API_URL.replace('/translate', '')}/vocabulary`);
    const vocab = await res.json();

    const cards = vocab.map(row => ({
      id: row.id,
      front: row.input_text,
      back: row.translation || '',
      note: row.meaning || '',
      language: row.target_lang
    }));

    await chrome.storage.local.set({ vocabCache: cards });

    // Bestehende Highlights entfernen und neu aufbauen
    document.querySelectorAll('.vocabi-highlight').forEach(mark => {
      const text = document.createTextNode(mark.textContent);
      mark.parentNode.replaceChild(text, mark);
    });

    highlightVocabOnPage(cards);
  } catch (err) {
    console.error('VocAbi: Cache refresh fehlgeschlagen', err);
  }
}

// ── Event Listener ────────────────────────────────────────────

document.addEventListener('mouseup', (e) => {
  if (icon.contains(e.target)) return;
  if (e.target.closest('.vocabi-highlight')) return; // Highlight-Klick nicht als Selektion werten

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

icon.addEventListener('click', () => {
  if (!savedSelection) return;
  icon.style.display = 'none';
  clearTimeout(iconTimeout);
  sendToAPI(savedSelection);
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.action !== 'translate') return;
  if (!savedSelection) return;
  sendToAPI(savedSelection);
});

document.addEventListener('mousedown', (e) => {
  if (!icon.contains(e.target) && !tooltip.contains(e.target) && !e.target.closest('.vocabi-highlight')) {
    icon.style.display = 'none';
    tooltip.style.display = 'none';
  }
});

// ── Start: Highlighting initialisieren ────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initHighlighting);
} else {
  initHighlighting();
}