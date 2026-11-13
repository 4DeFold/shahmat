const root = document.documentElement;
const themeColor = document.querySelector('meta[name="theme-color"]');
const preference = window.matchMedia('(prefers-color-scheme: dark)');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let manuallyChanged = false;
let requestedDark = preference.matches;
let currentTransition;
let fadeTimer;

function applyTheme(dark) {
  requestedDark = dark;
  root.dataset.theme = dark ? 'dark' : 'light';
  themeColor.setAttribute('content', dark ? '#000000' : '#ffffff');
  document.querySelectorAll('.theme-toggle').forEach(button => {
    button.setAttribute('aria-label', dark ? 'Включить светлую тему' : 'Включить тёмную тему');
  });
}

function changeTheme(button) {
  manuallyChanged = true;
  requestedDark = !requestedDark;
  const dark = requestedDark;
  if (currentTransition) currentTransition.skipTransition();
  if (reducedMotion.matches) { applyTheme(dark); return; }

  if (document.startViewTransition && window.CSS?.registerProperty) {
    const rect = button.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y)) + 120;
    root.style.setProperty('--theme-x', `${x}px`);
    root.style.setProperty('--theme-y', `${y}px`);
    root.style.setProperty('--theme-max-radius', `${radius}px`);
    const transition = document.startViewTransition(() => applyTheme(requestedDark));
    currentTransition = transition;
    transition.finished.finally(() => { if (currentTransition === transition) currentTransition = null; }).catch(() => {});
  } else {
    clearTimeout(fadeTimer);
    root.classList.add('theme-fade');
    void root.offsetWidth;
    applyTheme(dark);
    fadeTimer = setTimeout(() => root.classList.remove('theme-fade'), 700);
  }
}

applyTheme(preference.matches);
document.querySelectorAll('.theme-toggle').forEach(button => button.addEventListener('click', () => changeTheme(button)));
preference.addEventListener('change', event => { if (!manuallyChanged) applyTheme(event.matches); });
