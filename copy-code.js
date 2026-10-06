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

const filters = document.querySelector('[data-platform-filters]');
if (filters) {
  filters.hidden = false;
  const cards = [...document.querySelectorAll('[data-platform-categories]')];
  const status = document.querySelector('[data-platform-filter-status]');
  for (const button of filters.querySelectorAll('[data-platform-filter]')) {
    button.addEventListener('click', () => {
      const category = button.dataset.platformFilter;
      for (const option of filters.querySelectorAll('button'))
        option.setAttribute('aria-pressed', String(option === button));
      let count = 0;
      for (const card of cards) {
        card.hidden =
          category !== 'all' && !card.dataset.platformCategories.split(' ').includes(category);
        if (!card.hidden) count++;
      }
      status.textContent = `Showing ${count} ${category === 'all' ? '' : category + ' '}platforms.`;
    });
  }
}
