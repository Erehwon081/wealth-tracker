// Applies the saved theme before the page paints, so there is no flash of the wrong colours.
// Choice: 'system' (follow the phone), 'light' or 'dark'. Stored per device.
(function () {
  var BG = { light: '#f5f5fa', dark: '#0d0f14' };
  function choice() { try { return localStorage.getItem('bm-theme') || 'system'; } catch (e) { return 'system'; } }
  function effective(c) { return c === 'system' ? (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : c; }
  function apply(c) {
    var root = document.documentElement;
    if (c === 'light' || c === 'dark') root.setAttribute('data-theme', c); else root.removeAttribute('data-theme');
    var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', BG[effective(c)]);
    // In the Android app, light status bar icons on dark, dark icons on light.
    try { var sb = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.SystemBars; if (sb) sb.setStyle({ style: effective(c) === 'dark' ? 'DARK' : 'LIGHT' }); } catch (e) {}
  }
  window.wtTheme = {
    get: choice,
    set: function (c) { try { localStorage.setItem('bm-theme', c); } catch (e) {} apply(c); }
  };
  apply(choice());
  if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { apply(choice()); });
})();
