const root = document.documentElement;
const themeColor = document.querySelector('meta[name="theme-color"]');
const preference = window.matchMedia('(prefers-color-scheme: dark)');

function applyTheme(dark) {
  root.dataset.theme = dark ? 'dark' : 'light';
  themeColor.setAttribute('content', dark ? '#000000' : '#ffffff');
}

applyTheme(preference.matches);
preference.addEventListener('change', event => applyTheme(event.matches));
