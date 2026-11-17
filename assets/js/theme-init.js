/*
 * Runs in <head>, before first paint, so the page never flashes the wrong theme.
 * Same storage key and values as the app (localStorage.theme: 'light' | 'dark' | 'system').
 */
(function () {
  var html = document.documentElement;
  var stored = null;
  try {
    stored = localStorage.getItem('theme');
  } catch (_) {}
  var choice = stored === 'light' || stored === 'dark' ? stored : 'system';
  var prefersDark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  html.classList.toggle('dark', choice === 'dark' || (choice === 'system' && prefersDark));
  html.setAttribute('data-theme', choice);
})();
