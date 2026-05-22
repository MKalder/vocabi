document.addEventListener('mouseup', () => {
  const selectedText = window.getSelection().toString().trim();
  if (!selectedText) return;

  fetch('http://localhost:3000/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: selectedText, targetLang: 'Deutsch' })
  })
    .then(res => res.json())
    .then(data => {
      chrome.storage.session.set({ translation: data.result, word: selectedText });
    });
});

