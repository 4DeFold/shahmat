import './theme.js';

const button = document.getElementById('play');
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
  button.disabled = false;
  document.getElementById('landing-message').textContent = 'Не удалось загрузить сайт. Проверь соединение и обнови страницу.';
}
button.addEventListener('click', async () => {
  if (button.disabled) return;
  button.disabled = true;
  try {
    await loadApp();
    button.disabled = false;
    // After initialization the full application owns the click handler.
    button.click();
  } catch { showLoadFailure(); }
}, { once: true });

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
