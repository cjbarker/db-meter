// Light/dark toggle. The inline script in index.html sets the initial theme before paint;
// this module wires the button. A saved choice lives in sessionStorage (cleared with the tab).

const KEY = 'dbmeter.theme.v1';
const root = document.documentElement;
const media = matchMedia('(prefers-color-scheme: dark)');

function saved() {
  try {
    const v = sessionStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

export function initTheme(onChange) {
  const button = document.getElementById('theme-toggle');

  const apply = (theme) => {
    root.dataset.theme = theme;
    const next = theme === 'dark' ? 'light' : 'dark';
    button.setAttribute('aria-label', `Switch to ${next} mode`);
    button.title = `Switch to ${next} mode`;
    onChange?.(theme);
  };

  apply(root.dataset.theme === 'dark' ? 'dark' : 'light');

  button.addEventListener('click', () => {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try {
      sessionStorage.setItem(KEY, next);
    } catch {
      // Storage blocked: the choice still applies until reload.
    }
    apply(next);
  });

  // With no saved choice, keep following the OS setting.
  media.addEventListener('change', () => {
    if (!saved()) apply(media.matches ? 'dark' : 'light');
  });
}
