const root = document.documentElement;
const themeColor = document.querySelector('meta[name="theme-color"]');
const preference = window.matchMedia('(prefers-color-scheme: dark)');
let manuallyChanged = false;

function applyTheme(dark) {
  root.dataset.theme = dark ? 'dark' : 'light';
  themeColor.setAttribute('content', dark ? '#000000' : '#ffffff');
  document.querySelectorAll('.theme-toggle').forEach(button => {
    button.setAttribute('aria-label', dark ? 'Включить светлую тему' : 'Включить тёмную тему');
  });
}
applyTheme(preference.matches);
document.querySelectorAll('.theme-toggle').forEach(button => button.addEventListener('click', () => {
  manuallyChanged = true;
  applyTheme(root.dataset.theme !== 'dark');
}));
preference.addEventListener('change', event => { if (!manuallyChanged) applyTheme(event.matches); });
