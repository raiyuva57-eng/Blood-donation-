/* ============================================
   LifeDrop — theme toggle (dark / light)
   ============================================ */

const LifeDropTheme = (() => {
  const KEY = 'lifedrop_theme';

  function getStored() {
    return localStorage.getItem(KEY);
  }

  function systemPrefersDark() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }

  function init() {
    const stored = getStored();
    const theme = stored || (systemPrefersDark() ? 'dark' : 'light');
    apply(theme);
    return theme;
  }

  function toggle() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    apply(next);
    localStorage.setItem(KEY, next);
    return next;
  }

  return { init, toggle };
})();

// Apply immediately (before paint) to avoid a flash of the wrong theme.
LifeDropTheme.init();
