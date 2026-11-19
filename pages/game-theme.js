import {installPieceTheme} from './piece-theme.js';
installPieceTheme();
// Read only the active account's local settings; guests never need an API call.
const system = window.matchMedia('(prefers-color-scheme: dark)');
const palettes = new Set(['monochrome', 'gray', 'forest', 'atelier', 'wood', 'earth', 'ocean', 'amber', 'lavender', 'sand']);
function selectedTheme() {
  try {
    const session = JSON.parse(localStorage.getItem('sb-eswyxbyddkajysogtglp-auth-token') || 'null');
    const user = session?.user;
    if (!user?.id) return null;
    const local = JSON.parse(localStorage.getItem(`shahmat.appearance.${user.id}`) || 'null');
    const validLocal = local && palettes.has(local.palette) && [null, 'light', 'dark'].includes(local.theme)
      && Number.isSafeInteger(local.version) && typeof local.dirty === 'boolean';
    const remote = user.user_metadata || {};
    // The signed-in app updates this record when a remote change is polled;
    // the cached auth session metadata may still be older than that record.
    const value = validLocal ? local.theme : remote.palette_theme;
    return value === 'dark' || value === 'light' ? value : null;
  } catch { return null; }
}
function apply() {
  const theme = selectedTheme() || (system.matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#111111' : '#f7f7f5');
}
apply();
system.addEventListener('change', apply);
window.addEventListener('storage', apply);
