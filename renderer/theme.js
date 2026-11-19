'use strict';
// Run before styles are painted; a project never changes the user's theme.
(() => {
  const key = 'sloy-theme';
  const valid = new Set(['light', 'dark', 'system']);
  const system = matchMedia('(prefers-color-scheme: dark)');
  let preference = 'light';
  try {
    const saved = localStorage.getItem(key);
    if (valid.has(saved)) preference = saved;
  } catch { /* The interface also works when storage is unavailable. */ }
  function apply() {
    const theme = preference === 'system' ? (system.matches ? 'dark' : 'light') : preference;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#26282b' : '#f4f4f4');
    document.dispatchEvent(new CustomEvent('sloy-themechange', {detail: {theme}}));
  }
  apply();
  system.addEventListener('change', () => { if (preference === 'system') apply(); });
  document.addEventListener('DOMContentLoaded', () => {
    const select = document.getElementById('themeSelect');
    if (!select) return;
    select.value = preference;
    select.addEventListener('change', () => {
      if (!valid.has(select.value)) return;
      preference = select.value;
      try { localStorage.setItem(key, preference); } catch { /* Keep the selected theme for this session. */ }
      apply();
    });
  });
})();
