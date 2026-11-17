/* Browser behaviour: matcher steps, search with suggestions, filters, the saved
   list and "why this verdict". Answers and saved items live in this browser only
   (localStorage), so nothing about a visitor is ever sent anywhere.

   The entry data (data.js) is loaded straight away on pages that list entries and
   on demand everywhere else, so an entry page doesn't download all 781 entries
   unless the visitor searches or has answered the questions. */
(function () {
  var Hub = window.Hub;
  if (!Hub) return;
  var DATA = window.HUB_DATA || null;
  var PROFILE_KEY = "sch-profile-v2", OLD_PROFILE_KEY = "sch-profile-v1", SAVED_KEY = "sch-saved-v1", VIEW_KEY = "sch-view";
  var host = document.querySelector("[data-page]") || document.body;
  var page = host.getAttribute("data-page");
  var prefix = host.getAttribute("data-prefix") || "";
  var ver = host.getAttribute("data-ver") || "";
  var byId = {}, catName = {}, index = null;

  function setup() {
    DATA.entries.forEach(function (e) { byId[e.id] = e; });
    DATA.cats.forEach(function (c) { catName[c.id] = c.name; });
    index = Hub.buildIndex(DATA.entries);
  }
  if (DATA) setup();
  var dataWaiters = [], dataLoading = false;
  function withData(cb) {
    if (DATA) { cb(); return; }
    dataWaiters.push(cb);
    if (dataLoading) return;
    dataLoading = true;
    var s = document.createElement("script");
    s.src = prefix + "assets/data.js?v=" + ver;
    s.onload = function () {
      DATA = window.HUB_DATA;
      if (!DATA) return;
      setup();
      var list = dataWaiters; dataWaiters = [];
      list.forEach(function (fn) { fn(); });
    };
    document.head.appendChild(s);
  }

  /* Cookie-free event counts. Only the action name is sent, never answers or personal details. */
  function track(name, data) {
    try {
      if (window.umami && window.umami.track) window.umami.track(name, data);
      else if (window.plausible) window.plausible(name, data ? { props: data } : undefined);
    } catch (err) { /* analytics must never break the page */ }
  }

  function $(id) { return document.getElementById(id); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  var d0 = new Date(), TODAY = d0.getFullYear() + "-" + pad(d0.getMonth() + 1) + "-" + pad(d0.getDate());
  function esc(s) { return Hub.esc(s); }

  /* ---------- Storage ---------- */
  /* Answers are stored with a version. Version 1 knew "SA, Tasmania or NT" and "Another
     uni" as single choices; those answers can't be carried over, so they are asked again. */
  function migrateV1(old) {
    var out = {};
    Object.keys(old || {}).forEach(function (k) { out[k] = old[k]; });
    ["state", "campus"].forEach(function (k) { if (out[k] === "other") out[k] = ""; });
    if (out.uni === "other") out.uni = "";
    return out;
  }
  function cleanProfile(saved) {
    var p = Hub.blankProfile();
    Hub.QUESTIONS.forEach(function (q) {
      var v = saved[q.key];
      if (v === undefined || v === null || v === "") return;
      if (q.type === "number") { if (typeof v === "number" && !isNaN(v)) p[q.key] = v; return; }
      for (var i = 0; i < q.options.length; i++) if (q.options[i][0] === v) { p[q.key] = v; return; }
    });
    return p;
  }
  function loadProfile() {
    try {
      var raw = localStorage.getItem(PROFILE_KEY), saved = null;
      if (raw) saved = JSON.parse(raw);
      else { var old = localStorage.getItem(OLD_PROFILE_KEY); if (old) saved = migrateV1(JSON.parse(old)); }
      if (saved) return cleanProfile(saved);
    } catch (err) { /* storage unavailable: start blank */ }
    return Hub.blankProfile();
  }
  function saveProfile(p) {
    try { var o = { v: 2 }; Object.keys(p).forEach(function (k) { o[k] = p[k]; }); localStorage.setItem(PROFILE_KEY, JSON.stringify(o)); } catch (err) { /* ignore */ }
  }
  var memorySaved = [];
  function loadSaved() {
    try {
      var s = JSON.parse(localStorage.getItem(SAVED_KEY) || "[]");
      return Array.isArray(s) ? s.filter(function (id) { return typeof id === "string"; }) : [];
    } catch (err) { return memorySaved; }
  }
  function storeSaved(list) {
    memorySaved = list;
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(list)); } catch (err) { /* ignore */ }
  }
  var saved = loadSaved();
  function isSaved(id) { return saved.indexOf(id) >= 0; }
  function loadView() { try { return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "cards"; } catch (err) { return "cards"; } }
  function storeView(v) { try { localStorage.setItem(VIEW_KEY, v); } catch (err) { /* ignore */ } }

  /* ---------- Dates: work out "closes in N days" and "recheck due" in the browser ---------- */
  function refreshDates(root) {
    qsa(".stamp[data-nc]", root).forEach(function (el) {
      el.outerHTML = Hub.stampHTML({ status: el.getAttribute("data-status"), verified: el.getAttribute("data-ver"), nc: el.getAttribute("data-nc"), host: el.getAttribute("data-host") }, TODAY);
    });
    qsa(".chip.dl[data-closes]", root).forEach(function (el) {
      var dl = Hub.deadline({ closes: el.getAttribute("data-closes") }, TODAY);
      if (dl) { el.textContent = dl.text; el.className = "chip dl " + dl.cls; }
    });
    qsa("dd[data-nc]", root).forEach(function (el) {
      el.textContent = Hub.nextCheckText({ nc: el.getAttribute("data-nc"), verified: el.getAttribute("data-ver") }, TODAY);
    });
    qsa("dd[data-closes]", root).forEach(function (el) {
      var dl = Hub.deadline({ closes: el.getAttribute("data-closes") }, TODAY);
      if (dl) el.textContent = dl.text;
    });
  }

  /* ---------- Saved list: hearts everywhere ---------- */
  function nameOfCard(b) {
    var id = b.getAttribute("data-save");
    if (byId[id]) return byId[id].name;
    var h = b.closest ? b.closest(".card") : null;
    var a = h ? h.querySelector("h3 a") : null;
    return a ? a.textContent : "";
  }
  function syncSavedUI() {
    var n = saved.filter(function (id) { return !DATA || byId[id]; }).length;
    var pill = $("saved-count");
    if (pill) { pill.textContent = n ? String(n) : ""; pill.setAttribute("data-n", String(n)); }
    qsa("[data-mirror]").forEach(function (m) { m.textContent = n ? String(n) : ""; m.setAttribute("data-n", String(n)); });
    qsa("[data-save]").forEach(function (b) {
      var id = b.getAttribute("data-save"), on = isSaved(id);
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
      if (b.classList.contains("save-btn")) b.textContent = on ? "Saved to your list" : "Save to my list";
      else b.setAttribute("aria-label", (on ? "Remove " : "Save ") + nameOfCard(b) + (on ? " from your list" : " to your list"));
    });
  }
  function toggleSaved(id) {
    var i = saved.indexOf(id);
    if (i >= 0) saved.splice(i, 1); else { saved.push(id); track("save", { entry: id }); }
    storeSaved(saved);
    syncSavedUI();
    if (page === "saved") renderSaved();
  }
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest ? ev.target.closest("[data-save]") : null;
    if (!b) return;
    ev.preventDefault(); ev.stopPropagation();
    toggleSaved(b.getAttribute("data-save"));
  });

  document.addEventListener("click", function (ev) {
    var a = ev.target.closest ? ev.target.closest("a.go") : null;
    if (a) { var fit = document.getElementById("fit"); track("official-link", { entry: fit ? fit.getAttribute("data-id") : "" }); }
    var c = ev.target.closest ? ev.target.closest("[data-coll]") : null;
    if (c) track("collection", { name: c.getAttribute("data-coll") });
  });

  /* ---------- Shared bits ---------- */
  var VERDICT_ORDER = { yes: 0, maybe: 1, no: 2 };
  var STATUS_ORDER = { verified: 0, rechecking: 0, unverified: 1 };
  function closesRank(e) {
    var c = e.closes;
    if (c && c !== "closed" && c !== "ongoing" && c >= TODAY) return 0;
    if (!c || c === "ongoing") return 1;
    return 2;
  }
  function cmp(sort, any, vOf) {
    return function (a, b) {
      if (sort === "closing") {
        var ra = closesRank(a.e), rb = closesRank(b.e);
        if (ra !== rb) return ra - rb;
        if (ra === 0 && a.e.closes !== b.e.closes) return a.e.closes < b.e.closes ? -1 : 1;
      } else if (sort === "checked") {
        if (a.e.verified !== b.e.verified) return a.e.verified < b.e.verified ? 1 : -1;
      } else if (sort === "az") {
        return a.e.name.localeCompare(b.e.name);
      } else {
        if (a.score != null && b.score != null && a.score !== b.score) return b.score - a.score;
        var va = any ? VERDICT_ORDER[vOf(a.e)] : 0, vb = any ? VERDICT_ORDER[vOf(b.e)] : 0;
        if (va !== vb) return va - vb;
        var sa = STATUS_ORDER[a.e.status] || 0, sb = STATUS_ORDER[b.e.status] || 0;
        if (sa !== sb) return sa - sb;
      }
      return a.e.name.localeCompare(b.e.name);
    };
  }

  function passes(e, f) {
    if (f.kind && e.kind !== f.kind) return false;
    if (f.claim && e.claim !== f.claim) return false;
    if (f.cost && e.cost !== f.cost) return false;
    if (f.state && e.st && e.st.length && e.st.indexOf(f.state) < 0) return false;
    return true;
  }
  function collectionById(id) {
    for (var i = 0; i < DATA.collections.length; i++) if (DATA.collections[i].id === id) return DATA.collections[i];
    return null;
  }

  /* The address keeps the search, filters and view, so Back returns to the same list
     and a filtered list can be shared as a link. */
  var URL_KEYS = ["q", "c", "kind", "claim", "cost", "state", "sort", "view"];
  var URL_DEFAULT = { sort: "best", view: "cards" };
  function syncUrl(st) {
    if (!window.history || !history.replaceState) return;
    var qs = [];
    URL_KEYS.forEach(function (k) {
      var key = k === "c" ? "collection" : k, v = st[key];
      if (v && v !== URL_DEFAULT[k] && String(v).trim()) qs.push(encodeURIComponent(k) + "=" + encodeURIComponent(String(v).trim()));
    });
    try { history.replaceState(null, "", window.location.pathname + (qs.length ? "?" + qs.join("&") : "") + window.location.hash); } catch (err) { /* ignore */ }
  }
  function readUrl(st) {
    var params = new URLSearchParams(window.location.search);
    var opts = { kind: Hub.KINDS, claim: Hub.CLAIMS, cost: Hub.COSTS, sort: ["best", "closing", "checked", "az"], view: ["cards", "list"] };
    Object.keys(opts).forEach(function (k) { var v = params.get(k); if (v && opts[k].indexOf(v) >= 0) st[k] = v; });
    var s = params.get("state"); if (s && Hub.STATES.some(function (x) { return x[0] === s; })) st.state = s;
    if (params.get("q")) st.q = params.get("q");
    if (params.get("c")) st.collection = params.get("c");
  }

  /* ---------- Header search with suggestions ---------- */
  var hq = $("hq"), hlist = $("hq-list"), hform = $("hsearch"), sel = -1;
  var onHome = page === "home";
  var homeState = { q: "", kind: "", claim: "", cost: "", state: "", sort: "best", collection: "", view: loadView(), limit: 30 };
  var renderHome = null;

  function closeSuggest() {
    if (hlist) { hlist.hidden = true; hlist.innerHTML = ""; }
    if (hq) { hq.setAttribute("aria-expanded", "false"); hq.removeAttribute("aria-activedescendant"); }
    sel = -1;
  }
  function suggest() {
    var q = hq.value.trim();
    if (q.length < 2 || !index) { closeSuggest(); return; }
    var res = Hub.search(index, q) || [];
    if (!res.length) { closeSuggest(); return; }
    var items = res.slice(0, 6).map(function (r, i) {
      return '<li role="option" id="sg-' + i + '" aria-selected="false"><a tabindex="-1" href="' + prefix + "entry/" + esc(r.e.id) + '.html"><span>' + esc(r.e.name) + "</span><small>" + esc(r.e.provider) + "</small></a></li>";
    });
    items.push('<li class="all" role="option" id="sg-all" aria-selected="false"><a tabindex="-1" href="' + prefix + "index.html?q=" + encodeURIComponent(q) + '#results">See all ' + res.length + (res.length === 1 ? " result" : " results") + "</a></li>");
    hlist.innerHTML = items.join("");
    hlist.hidden = false; hq.setAttribute("aria-expanded", "true"); hq.removeAttribute("aria-activedescendant"); sel = -1;
  }
  function moveSel(delta) {
    var opts = qsa("[role=option]", hlist);
    if (!opts.length) return;
    sel = (sel + delta + opts.length) % opts.length;
    opts.forEach(function (o, i) { o.setAttribute("aria-selected", i === sel ? "true" : "false"); });
    hq.setAttribute("aria-activedescendant", opts[sel].id);
  }
  function initSearch() {
    if (!hq || hq.getAttribute("data-ready")) return;
    hq.setAttribute("data-ready", "1");
    hq.addEventListener("input", function () {
      suggest();
      if (onHome && renderHome) { homeState.q = hq.value; homeState.limit = 30; renderHome(); }
    });
    hq.addEventListener("keydown", function (ev) {
      if (ev.key === "ArrowDown") { ev.preventDefault(); if (hlist.hidden) suggest(); moveSel(1); }
      else if (ev.key === "ArrowUp") { ev.preventDefault(); moveSel(-1); }
      else if (ev.key === "Escape") { closeSuggest(); document.body.classList.remove("searching"); }
      else if (ev.key === "Enter" && sel >= 0) { ev.preventDefault(); var a = qsa("[role=option] a", hlist)[sel]; if (a) window.location.href = a.getAttribute("href"); }
    });
    document.addEventListener("click", function (ev) { if (hform && !hform.contains(ev.target)) closeSuggest(); });
    hform.addEventListener("submit", function (ev) {
      if (onHome) { ev.preventDefault(); closeSuggest(); var r = $("results"); if (r) r.scrollIntoView({ block: "start" }); }
    });
    if (hq.value.trim()) suggest();
  }
  if (hq) {
    if (DATA) initSearch();
    else {
      var warm = function () { withData(initSearch); };
      hq.addEventListener("focus", warm); hq.addEventListener("pointerdown", warm); hq.addEventListener("input", warm);
    }
  }
  var tab = $("tab-search");
  if (tab) tab.addEventListener("click", function () {
    document.body.classList.toggle("searching");
    if (document.body.classList.contains("searching")) hq.focus(); else closeSuggest();
  });
  if (hq) hq.addEventListener("blur", function () { setTimeout(function () { if (document.activeElement !== hq && !(hform && hform.contains(document.activeElement))) document.body.classList.remove("searching"); }, 150); });

  /* ---------- Filter bar (home, category and landing pages) ---------- */
  function present(list, key) {
    var seen = {};
    list.forEach(function (e) { if (e[key]) seen[e[key]] = true; });
    return seen;
  }
  function select(id, label, options, value) {
    return '<div class="field"><label for="' + id + '">' + esc(label) + '</label><select id="' + id + '">' + options.map(function (o) {
      return '<option value="' + esc(o[0]) + '"' + (o[0] === value ? " selected" : "") + ">" + esc(o[1]) + "</option>";
    }).join("") + "</select></div>";
  }
  function filterBarHTML(scope, st) {
    var kinds = present(scope, "kind"), claims = present(scope, "claim"), costs = present(scope, "cost");
    var opt = function (all, seen, any) { return [["", any]].concat(all.filter(function (k) { return seen[k]; }).map(function (k) { return [k, k]; })); };
    var on = filtersActive(st);
    return '<details class="filter-toggle"' + (on ? " open" : "") + '><summary>Filter and sort' + (on ? ' <span class="on-dot" aria-label="filters on"></span>' : "") + '</summary><div class="toolbar" role="group" aria-label="Filter and sort">' +
      select("fl-kind", "Who offers it", opt(Hub.KINDS, kinds, "Anyone"), st.kind) +
      select("fl-claim", "How you get it", opt(Hub.CLAIMS, claims, "Any way"), st.claim) +
      select("fl-cost", "What it's worth", opt(Hub.COSTS, costs, "Anything"), st.cost) +
      select("fl-state", "Where", [["", "Anywhere in Australia"]].concat(Hub.STATES), st.state) +
      select("fl-sort", "Sort by", [["best", "Best match"], ["closing", "Closing soonest"], ["checked", "Recently checked"], ["az", "A to Z"]], st.sort) +
      select("fl-view", "Show as", [["cards", "Cards"], ["list", "Compact list"]], st.view) +
      '<button type="button" class="linkish" id="fl-clear">Clear filters</button></div></details>';
  }
  function bindFilters(root, st, onChange) {
    [["fl-kind", "kind"], ["fl-claim", "claim"], ["fl-cost", "cost"], ["fl-state", "state"], ["fl-sort", "sort"], ["fl-view", "view"]].forEach(function (pair) {
      var el = root.querySelector("#" + pair[0]);
      if (el) el.addEventListener("change", function () { st[pair[1]] = el.value; if (pair[1] === "view") storeView(el.value); st.limit = 30; onChange(); });
    });
    var clr = root.querySelector("#fl-clear");
    if (clr) clr.addEventListener("click", function () {
      st.kind = st.claim = st.cost = st.state = ""; st.sort = "best"; st.limit = 30;
      ["fl-kind", "fl-claim", "fl-cost", "fl-state"].forEach(function (id) { var el = root.querySelector("#" + id); if (el) el.value = ""; });
      var s = root.querySelector("#fl-sort"); if (s) s.value = "best";
      onChange();
    });
  }
  function filtersActive(st) { return !!(st.kind || st.claim || st.cost || st.state || st.sort !== "best"); }
  function cardsWrap(html, st) { return '<div class="cards' + (st.view === "list" ? " compact" : "") + '">' + html + "</div>"; }

  /* ---------- Matcher: a few steps, one screen at a time ---------- */
  function initMatcher(profile, onChange) {
    var form = $("matcher"); if (!form) return;
    Hub.QUESTIONS.forEach(function (qq) {
      var el = $("f-" + qq.key); if (!el) return;
      el.value = profile[qq.key] == null ? "" : profile[qq.key];
      el.addEventListener(qq.type === "number" ? "input" : "change", function () {
        if (qq.type === "number") { var n = parseInt(el.value, 10); profile[qq.key] = isNaN(n) ? null : n; }
        else profile[qq.key] = el.value;
        saveProfile(profile); markDone(); onChange();
      });
    });
    $("reset").addEventListener("click", function () {
      var blank = Hub.blankProfile();
      Object.keys(blank).forEach(function (k) { profile[k] = blank[k]; });
      saveProfile(profile);
      Hub.QUESTIONS.forEach(function (qq) { var el = $("f-" + qq.key); if (el) el.value = ""; });
      markDone(); onChange();
    });
    form.addEventListener("submit", function (ev) { ev.preventDefault(); });

    var steps = qsa("fieldset.step", form), bar = $("stepper-bar"), cur = 1;
    form.classList.add("stepper");
    function stepAnswered(n) {
      return Hub.QUESTIONS.some(function (q) { return q.step === n && !(profile[q.key] === null || profile[q.key] === ""); });
    }
    function markDone() {
      qsa("button", bar).forEach(function (b) {
        var n = +b.getAttribute("data-step");
        b.classList.toggle("done", stepAnswered(n));
      });
    }
    function show(n) {
      cur = Math.max(1, Math.min(steps.length, n));
      steps.forEach(function (fs, i) { fs.classList.toggle("on", i + 1 === cur); });
      qsa("button", bar).forEach(function (b) {
        if (+b.getAttribute("data-step") === cur) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
      });
      $("step-back").hidden = cur === 1;
      $("step-next").textContent = cur === steps.length ? "See my results" : "Next";
    }
    qsa("button", bar).forEach(function (b) {
      b.addEventListener("click", function () { show(+b.getAttribute("data-step")); });
    });
    $("step-back").addEventListener("click", function () { show(cur - 1); });
    $("step-next").addEventListener("click", function () {
      if (cur === steps.length) { track("matcher-done"); var r = $("recap") || $("results"); if (r) r.scrollIntoView({ block: "start" }); }
      else show(cur + 1);
    });
    markDone(); show(1);
  }

  /* ---------- Home ---------- */
  function initHome() {
    var results = $("results"), profile = loadProfile();

    /* Containers added by the browser: summary, filters, collections */
    var recap = document.createElement("div"); recap.id = "recap";
    var filters = document.createElement("div"); filters.id = "filters";
    results.parentNode.insertBefore(recap, results);
    results.parentNode.insertBefore(filters, results);

    readUrl(homeState);
    if (homeState.q && hq) hq.value = homeState.q;
    var lastSaved = [];

    function collectionObj() { return collectionById(homeState.collection); }

    function cardOpts(e, any, vOf) {
      return { verdict: any ? vOf(e) : null, today: TODAY, saved: isSaved(e.id), brief: any ? Hub.brief(e, profile) : "" };
    }
    function cardsHTML(items, any, vOf) {
      return cardsWrap(items.map(function (x) { return Hub.cardHTML(x.e, prefix, cardOpts(x.e, any, vOf)); }).join(""), homeState);
    }

    function render() {
      var any = Hub.answeredCount(profile) > 0, st = homeState;
      var cache = {};
      var vOf = function (e) { return cache[e.id] || (cache[e.id] = Hub.evaluate(e, profile)); };
      var coll = collectionObj();
      var found = st.q.trim() ? Hub.search(index, st.q) : null;
      var pool = (found ? found.map(function (r) { return { e: r.e, score: r.score }; }) : DATA.entries.map(function (e) { return { e: e }; }))
        .filter(function (x) { return passes(x.e, st) && Hub.inCollection(x.e, coll); });
      var flat = !!(found || filtersActive(st) || coll);
      syncUrl(st);

      /* Tally across everything in view */
      var tally = { yes: 0, maybe: 0, no: 0 };
      if (any) pool.forEach(function (x) { tally[vOf(x.e)]++; });
      $("tally").innerHTML = any ? "<b>" + tally.yes + "</b> likely for you, <b>" + tally.maybe + "</b> might apply, " + tally.no + " probably not." : "Answer any question to sort the list.";
      if (any) {
        var likely = pool.filter(function (x) { return vOf(x.e) === "yes"; });
        var undoable = lastSaved.filter(function (id) { return isSaved(id); });
        recap.innerHTML = '<div class="recap"><p><b>' + tally.yes + '</b> likely for you, <b>' + tally.maybe + "</b> might apply.</p>" +
          (undoable.length
            ? '<p class="recap-saved" role="status">Saved ' + undoable.length + '. <a href="' + prefix + 'saved.html">Open your list</a> <button type="button" class="linkish" id="undo-save">Undo</button></p>'
            : likely.length ? '<button type="button" class="btn small" id="save-likely">Save the ' + likely.length + " likely ones</button>" : "") + "</div>";
        var sl = $("save-likely");
        if (sl) sl.addEventListener("click", function () {
          lastSaved = [];
          likely.forEach(function (x) { if (!isSaved(x.e.id)) { saved.push(x.e.id); lastSaved.push(x.e.id); } });
          storeSaved(saved); syncSavedUI(); track("save-likely", { n: likely.length });
          render();
        });
        var un = $("undo-save");
        if (un) un.addEventListener("click", function () {
          saved = saved.filter(function (id) { return lastSaved.indexOf(id) < 0; });
          lastSaved = []; storeSaved(saved); syncSavedUI(); render();
        });
      } else recap.innerHTML = "";

      /* Filters */
      if (!filters.getAttribute("data-built")) {
        filters.innerHTML = filterBarHTML(DATA.entries, st); filters.setAttribute("data-built", "1");
        bindFilters(filters, st, render);
      }

      var html = "";
      if (flat) {
        pool.sort(cmp(st.sort, any, vOf));
        var shown = pool.filter(function (x) { return !(any && vOf(x.e) === "no"); });
        var hidden = pool.filter(function (x) { return any && vOf(x.e) === "no"; });
        var label = found ? "for “" + esc(st.q.trim()) + "”" : coll ? "in " + esc(coll.name) : "that match";
        html += '<p class="search-note" role="status">' + (pool.length ? "<b>" + pool.length + "</b> " + (pool.length === 1 ? "result " : "results ") + label : "Nothing " + (found ? "matches “" + esc(st.q.trim()) + "”" : "matches those filters") + ". Try a broader word, like rent, laptop or fares, or clear the filters.") + " " +
          (coll ? '<span class="active-collection">' + esc(coll.name) + '<button type="button" id="clear-coll" aria-label="Clear ' + esc(coll.name) + '">×</button></span> ' : "") +
          '<button type="button" class="linkish" id="clear-all">Clear search and filters</button></p>';
        if (!pool.length && found && st.q.trim().length > 2 && lastZero !== st.q.trim()) { lastZero = st.q.trim(); track("search-no-results", { q: lastZero.slice(0, 40) }); }
        if (!pool.length) html += '<div class="empty"><h3>No matches</h3><p>Most entries use plain words, such as "rent", "laptop", "fares" or "scholarship". You can also browse by category below.</p></div>';
        if (shown.length) html += cardsHTML(shown.slice(0, st.limit), any, vOf) + (shown.length > st.limit ? '<button type="button" class="show-more" id="more-flat">Show ' + Math.min(30, shown.length - st.limit) + " more of " + (shown.length - st.limit) + " left</button>" : "");
        if (hidden.length) html += '<details class="later"><summary>Probably not for you <span class="ct">' + hidden.length + '</span></summary><p class="gn">Based on your answers. Open one to read the rules for yourself.</p>' + cardsHTML(hidden.slice(0, 30), any, vOf) + "</details>";
      } else {
        /* Default view: closing soon, collections, then the categories */
        var closing = pool.filter(function (x) {
          var c = x.e.closes; if (!c || c === "closed" || c === "ongoing") return false;
          var days = Hub.daysUntil(c, TODAY);
          return days >= 0 && days <= 45 && !(any && vOf(x.e) === "no");
        }).sort(function (a, b) { return a.e.closes < b.e.closes ? -1 : a.e.closes > b.e.closes ? 1 : 0; });
        if (closing.length) {
          html += '<section class="group" id="g-closing" aria-labelledby="h-closing"><div class="group-head"><h2 id="h-closing">Closing soon <span class="ct">' + closing.length + '</span></h2><button type="button" class="linkish" id="all-closing">See everything by closing date</button></div>' +
            '<p class="gn">Applications with a closing date in the next 45 days. Dates come from each official page.</p>' + cardsHTML(closing.slice(0, 3), any, vOf) + "</section>";
        }
        html += '<section class="group" aria-labelledby="h-coll"><div class="group-head"><h2 id="h-coll">Start from your situation</h2></div><div class="collections">' +
          DATA.collections.map(function (c) {
            var n = DATA.entries.filter(function (e) { return Hub.inCollection(e, c); }).length;
            return '<button type="button" class="collection" data-coll="' + esc(c.id) + '"><b>' + esc(c.name) + "</b><span>" + esc(c.blurb) + '</span><span class="ct">' + n + " entries</span></button>";
          }).join("") + "</div></section>";
        if (!any) {
          html += '<p class="gn start-hint">Answer a few questions above and everything here is sorted for you. Or browse by category below.</p>';
          results.innerHTML = html; wire(); return;
        }
        var groups = {}, notForYou = [];
        pool.forEach(function (x) {
          if (any && vOf(x.e) === "no") { notForYou.push(x); return; }
          (groups[x.e.category] = groups[x.e.category] || []).push(x);
        });
        DATA.cats.forEach(function (c) {
          var items = groups[c.id];
          if (!items || !items.length) return;
          items.sort(cmp("best", any, vOf));
          var open = !!expanded[c.id];
          html += '<section class="group" id="g-' + c.id + '" aria-labelledby="h-' + c.id + '"><div class="group-head"><h2 id="h-' + c.id + '">' + esc(c.name) + ' <span class="ct">' + items.length + '</span></h2><a class="more" href="' + prefix + "category/" + c.id + '.html" aria-label="View all in ' + esc(c.name) + '">View all</a></div>' +
            cardsHTML(open ? items : items.slice(0, 6), any, vOf) +
            (items.length > 6 && !open ? '<button type="button" class="show-more" data-key="' + c.id + '">Show all ' + items.length + "</button>" : "") + "</section>";
        });
        if (notForYou.length) {
          notForYou.sort(cmp("best", any, vOf));
          html += '<details class="later" id="later"' + (laterOpen ? " open" : "") + '><summary>Probably not for you <span class="ct">' + notForYou.length + '</span></summary><p class="gn">Based on your answers. Open one to read the rules for yourself.</p>' + cardsHTML(notForYou.slice(0, 30), any, vOf) + "</details>";
        }
      }
      results.innerHTML = html;
      wire();
    }

    var expanded = {}, laterOpen = false, lastZero = "";
    function wire() {
      var q;
      qsa(".show-more[data-key]", results).forEach(function (b) {
        b.addEventListener("click", function () { expanded[b.getAttribute("data-key")] = true; laterOpen = !!(results.querySelector("#later") || {}).open; render(); });
      });
      var later = results.querySelector("#later");
      if (later) later.addEventListener("toggle", function () { laterOpen = later.open; });
      if ((q = $("clear-all"))) q.addEventListener("click", function () {
        homeState.q = ""; homeState.collection = ""; homeState.kind = homeState.claim = homeState.cost = homeState.state = ""; homeState.sort = "best";
        if (hq) hq.value = "";
        filters.removeAttribute("data-built");
        render();
      });
      if ((q = $("clear-coll"))) q.addEventListener("click", function () { homeState.collection = ""; render(); });
      if ((q = $("more-flat"))) q.addEventListener("click", function () { homeState.limit += 30; render(); });
      if ((q = $("all-closing"))) q.addEventListener("click", function () { homeState.sort = "closing"; filters.removeAttribute("data-built"); render(); results.scrollIntoView({ block: "start" }); });
      qsa("[data-coll]", results).forEach(function (b) {
        b.addEventListener("click", function () { homeState.collection = b.getAttribute("data-coll"); homeState.limit = 30; render(); results.scrollIntoView({ block: "start" }); });
      });
    }

    renderHome = render;
    initMatcher(profile, render);
    render();
    syncSavedUI();
    if (window.location.hash === "#results" && (homeState.q || homeState.collection)) results.scrollIntoView({ block: "start" });
  }

  /* ---------- Category, university, state and situation pages ---------- */
  function scopeEntries(scope) {
    var parts = String(scope || "").split(":"), kind = parts[0], id = parts[1];
    return DATA.entries.filter(function (e) {
      if (kind === "category") return e.category === id;
      if (kind === "inst") return e.inst === id;
      if (kind === "state") return !!(e.st && e.st.indexOf(id) >= 0);
      if (kind === "situation") return Hub.inCollection(e, collectionById(id));
      return true;
    });
  }
  function initCategory() {
    var profile = loadProfile(), list = $("list"), fbox = $("filters");
    if (!list || !fbox) return;
    var scope = scopeEntries(fbox.getAttribute("data-scope"));
    var st = { kind: "", claim: "", cost: "", state: "", sort: "best", view: loadView(), limit: 60 };
    readUrl(st);
    fbox.innerHTML = filterBarHTML(scope, st);
    function render() {
      var any = Hub.answeredCount(profile) > 0, cache = {};
      var vOf = function (e) { return cache[e.id] || (cache[e.id] = Hub.evaluate(e, profile)); };
      var items = scope.filter(function (e) { return passes(e, st); }).map(function (e) { return { e: e }; });
      items.sort(cmp(st.sort, any, vOf));
      var shown = items.slice(0, st.limit);
      list.className = "cards" + (st.view === "list" ? " compact" : "");
      list.innerHTML = shown.map(function (x) {
        return Hub.cardHTML(x.e, prefix, { verdict: any ? vOf(x.e) : null, brief: any ? Hub.brief(x.e, profile) : "", saved: isSaved(x.e.id), today: TODAY });
      }).join("") || '<div class="empty"><h3>No matches</h3><p>Nothing here fits those filters. Clear them to see everything.</p></div>';
      var more = $("more-cat");
      if (more) more.remove();
      if (items.length > st.limit) {
        var b = document.createElement("button"); b.type = "button"; b.className = "show-more"; b.id = "more-cat";
        b.textContent = "Show more (" + (items.length - st.limit) + " left)";
        b.addEventListener("click", function () { st.limit += 60; render(); });
        list.parentNode.insertBefore(b, list.nextSibling);
      }
      var note = $("fit-note"); if (note) note.hidden = !any;
      syncUrl(st);
      syncSavedUI();
    }
    bindFilters(fbox, st, render);
    render();
  }

  /* ---------- Entry page: does it fit, and why ---------- */
  function initEntry() {
    var box = $("fit"); if (!box) return;
    var profile = loadProfile();
    if (!Hub.answeredCount(profile)) {
      box.innerHTML = '<div class="row">Not sure this fits you?</div><p>Answer a few questions and we\'ll say whether it fits, and why. <a href="' + prefix + 'index.html#matcher">Find yours</a></p>';
      box.hidden = false; return;
    }
    withData(function () {
      var e = byId[box.getAttribute("data-id")]; if (!e) return;
      var ex = Hub.explain(e, profile);
      var words = { yes: "Likely for you", maybe: "Might apply to you", no: "Probably not for you" }[ex.verdict];
      box.innerHTML = '<div class="row">' + Hub.verdictBadge(ex.verdict) + "<span>" + words + '</span></div><ul>' +
        ex.reasons.map(function (r) { return '<li class="' + r.t + '">' + esc(r.text) + "</li>"; }).join("") + "</ul>" +
        '<p class="gn"><a href="' + prefix + 'index.html#matcher">Change your answers</a></p>';
      box.hidden = false;
    });
  }

  /* ---------- Saved page ---------- */
  var clearArmed = false;
  function renderSaved() {
    var list = $("saved-list"); if (!list) return;
    var profile = loadProfile(), any = Hub.answeredCount(profile) > 0;
    var items = saved.map(function (id) { return { e: byId[id] }; }).filter(function (x) { return x.e; });
    var vOf = function (e) { return Hub.evaluate(e, profile); };
    items.sort(cmp("closing", any, vOf));
    list.innerHTML = items.map(function (x) {
      return Hub.cardHTML(x.e, prefix, { verdict: any ? vOf(x.e) : null, brief: any ? Hub.brief(x.e, profile) : "", saved: true, today: TODAY });
    }).join("");
    $("saved-empty").hidden = items.length > 0;
    $("saved-actions").hidden = items.length === 0;
    $("saved-lede").textContent = items.length ? items.length + (items.length === 1 ? " concession" : " concessions") + " saved, with the ones closing soonest first." : "Concessions you've saved will show up here.";
    syncSavedUI();
  }
  function initSaved() {
    renderSaved();
    var pr = $("saved-print"), cp = $("saved-copy"), cl = $("saved-clear");
    if (pr) pr.addEventListener("click", function () { track("saved-print"); window.print(); });
    if (cp) cp.addEventListener("click", function () {
      var lines = saved.map(function (id) {
        var e = byId[id]; if (!e) return "";
        var dl = Hub.deadline(e, TODAY);
        return "- " + e.name + " (" + e.provider + ")" + (e.v ? ": " + e.v + (e.vu ? " " + e.vu : "") : "") + (dl ? " [" + dl.text + "]" : "") + "\n  " + new URL(prefix + "entry/" + e.id + ".html", window.location.href).href;
      }).filter(Boolean);
      var text = "My saved concessions\n\n" + lines.join("\n");
      var done = function () { cp.textContent = "Copied"; setTimeout(function () { cp.textContent = "Copy as text"; }, 1800); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { cp.textContent = "Copy failed"; });
      else { var ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); done(); } catch (err) { cp.textContent = "Copy failed"; } ta.remove(); }
    });
    if (cl) cl.addEventListener("click", function () {
      if (!clearArmed) { clearArmed = true; cl.textContent = "Press again to clear the list"; setTimeout(function () { clearArmed = false; cl.textContent = "Clear list"; }, 3000); return; }
      saved = []; storeSaved(saved); clearArmed = false; cl.textContent = "Clear list"; renderSaved();
    });
  }

  /* ---------- Report form: a searchable list of entries, preselected from ?entry= ---------- */
  function initReport() {
    var el = $("r-entry"), dl = $("r-entry-list"); if (!el || !dl) return;
    dl.innerHTML = DATA.entries.map(function (e) { return '<option value="' + esc(e.name) + '"></option>'; }).join("");
    var m = /[?&]entry=([a-z0-9-]+)/.exec(window.location.search);
    if (m && byId[m[1]]) el.value = byId[m[1]].name;
  }

  /* ---------- Start up ---------- */
  refreshDates();
  syncSavedUI();
  if (DATA) {
    syncSavedUI();
    if (page === "home") initHome();
    else if (page === "report") initReport();
    else if (page === "category") initCategory();
    else if (page === "saved") initSaved();
  }
  if (page === "entry") initEntry();
})();
