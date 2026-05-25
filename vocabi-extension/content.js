const API_URL = 'https://api.prodowner.de/translate';

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

document.addEventListener('mouseup', async (e) => {
  const selectedText = window.getSelection().toString().trim();

  if (!selectedText) {
    tooltip.style.display = 'none';
    return;
  }

  tooltip.style.display = 'block';
  tooltip.style.left = e.pageX + 'px';
  tooltip.style.top = (e.pageY + 20) + 'px';
  tooltip.textContent = 'Translate...';

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: selectedText,
        targetLang: 'english',
        sourceUrl: window.location.href
      })
    });
    const data = await res.json();
    tooltip.textContent = data.result;
  } catch (err) {
    tooltip.textContent = 'Error';
  }
});

document.addEventListener('mousedown', (e) => {
  if (!tooltip.contains(e.target)) {
    tooltip.style.display = 'none';
  }
});