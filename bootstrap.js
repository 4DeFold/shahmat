import './theme.js';

let appPromise;
async function loadApp() {
  if (!appPromise) appPromise = (async () => {
    const { default: shell } = await import('./pages/app-shell.html?raw');
    document.querySelector('.landing').insertAdjacentHTML('beforeend', shell);
    const app = await import('./app.js');
    await app.appReady;
  })();
  return appPromise;
}
function showLoadFailure() {
  document.getElementById('landing-screen').hidden = false;
  document.body.classList.add('startup-ready');
  document.getElementById('landing-message').textContent = 'Не удалось загрузить сайт. Проверь соединение и обнови страницу.';
}
// Old bookmarks for the former play tab open the standalone game.
if (location.hash === '#play') location.replace('/play');

let needsSession = location.pathname !== '/' || !!location.hash;
try {
  needsSession ||= !!localStorage.getItem('sb-eswyxbyddkajysogtglp-auth-token') || !!sessionStorage.getItem('shahmat.recovery-pending');
} catch { needsSession = true; }
if (needsSession) {
  loadApp().catch(showLoadFailure);
} else {
  document.getElementById('landing-screen').hidden = false;
  document.body.classList.add('startup-ready');
}
