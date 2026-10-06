for (const button of document.querySelectorAll('[data-copy-code]')) {
  const figure = button.closest('figure');
  const code = figure.querySelector('pre code');
  const status = figure.querySelector('[data-copy-status]');
  let reset;
  button.hidden = false;
  button.addEventListener('click', async () => {
    clearTimeout(reset);
    try {
      await navigator.clipboard.writeText(code.textContent);
      button.textContent = 'Copied!';
      status.textContent = 'Code copied to clipboard.';
    } catch {
      const range = document.createRange();
      range.selectNodeContents(code);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      button.textContent = 'Selected';
      status.textContent = 'Clipboard unavailable. Code selected; press Ctrl+C or Cmd+C to copy.';
    }
    reset = setTimeout(() => {
      button.textContent = 'Copy';
    }, 2500);
  });
}
