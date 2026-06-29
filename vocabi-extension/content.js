const API_URL = 'https://api.prodowner.de/translate';

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

function showIcon(rect) {
  icon.style.left = `${rect.right + window.scrollX + 8}px`;
  icon.style.top = `${rect.bottom + window.scrollY - 28}px`;
  icon.style.display = 'flex';

  clearTimeout(iconTimeout);
  iconTimeout = setTimeout(() => {
    icon.style.display = 'none';
  }, 3000);
}

function showError(message, rect) {
  tooltip.style.left = `${rect.right + window.scrollX + 8}px`;
  tooltip.style.top = `${rect.bottom + window.scrollY + 8}px`;
  tooltip.textContent = message;
  tooltip.style.display = 'block';

  setTimeout(() => {
    tooltip.style.display = 'none';
  }, 2000);
}

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
  };

  eventSource.onerror = () => {
    eventSource.close();
    tooltip.textContent = 'Connection error.';
  };
}

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

function extractContext(range) {
  const text = range.startContainer.textContent || '';
  const sentences = text.match(/[^.!?]+[.!?]*/g) || [text];
  const selected = range.toString();
  return (sentences.find(s => s.includes(selected)) || '').trim();
}

async function sendToAPI(selection) {
  const { text, type, context, rect } = selection;

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        type,
        context,
        targetLang: 'english',
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

document.addEventListener('mouseup', (e) => {
  if (icon.contains(e.target)) return;

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
  if (!icon.contains(e.target) && !tooltip.contains(e.target)) {
    icon.style.display = 'none';
    tooltip.style.display = 'none';
  }
});

eventSource.onmessage = (e) => {
  const data = JSON.parse(e.data);
  eventSource.close();
  tooltip.textContent = data.status === 'done' ? data.result : 'Error while translating.';

  // Dashboard informieren falls offen
  if (data.status === 'done') {
    chrome.runtime.sendMessage({ action: 'vocabAdded' });
  }
};