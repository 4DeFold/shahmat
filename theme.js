(function () {
  var root = document.documentElement;
  var button = document.querySelector('.play-button');
  var themeColor = document.querySelector('meta[name="theme-color"]');

  function applyTheme(dark) {
    root.dataset.theme = dark ? 'dark' : 'light';
    button.setAttribute('aria-pressed', String(dark));
    button.setAttribute('aria-label', dark ? 'PLAY: switch to light theme' : 'PLAY: switch to dark theme');
    themeColor.setAttribute('content', dark ? '#000000' : '#ffffff');
  }

  applyTheme(false);
  button.addEventListener('click', function () {
    applyTheme(root.dataset.theme !== 'dark');
  });
}());
