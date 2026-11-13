// Temporary theme control. The light theme remains the default.
(function () {
  var root = document.documentElement;
  var dark = false;

  try {
    dark = localStorage.getItem('shahmat-theme') === 'dark';
  } catch (error) {
    // The switch still works for this visit when storage is unavailable.
  }

  if (dark) root.dataset.theme = 'dark';

  document.addEventListener('DOMContentLoaded', function () {
    var toggle = document.querySelector('.theme-switch input');
    if (!toggle) return;
    toggle.checked = dark;
    toggle.addEventListener('change', function () {
      if (toggle.checked) root.dataset.theme = 'dark';
      else delete root.dataset.theme;
      try {
        localStorage.setItem('shahmat-theme', toggle.checked ? 'dark' : 'light');
      } catch (error) {
        // Storage is optional.
      }
    });
  });
}());
