/* Colour theme: automatic (follows the device), light or dark. Runs in the page head so
   the chosen theme is on the page before it paints. The choice stays in this browser only. */
(function () {
  var KEY = "sch-theme", root = document.documentElement;
  function read() { try { var v = localStorage.getItem(KEY); return v === "light" || v === "dark" ? v : "auto"; } catch (err) { return "auto"; } }
  function apply(t) { if (t === "auto") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", t); }
  apply(read());
  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.getElementById("theme-btn");
    if (!btn) return;
    var names = { auto: "auto", light: "light", dark: "dark" };
    function label(t) {
      btn.textContent = "Theme: " + names[t];
      btn.setAttribute("aria-label", "Colour theme: " + names[t] + ". Press to change.");
    }
    label(read());
    btn.addEventListener("click", function () {
      var order = ["auto", "light", "dark"], next = order[(order.indexOf(read()) + 1) % 3];
      try { if (next === "auto") localStorage.removeItem(KEY); else localStorage.setItem(KEY, next); } catch (err) { /* ignore */ }
      apply(next); label(next);
    });
  });
})();
