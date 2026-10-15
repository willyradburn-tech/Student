/* Shared by the build (Node) and the browser: matching rules, derived card
   facts, search and card markup. One copy means the pages the build writes and
   the pages the browser redraws always look and behave the same. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Hub = factory();
})(typeof self !== "undefined" ? self : this, function () {
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function fmtDate(iso) {
    if (!iso) return "";
    var p = String(iso).split("-");
    return parseInt(p[2], 10) + " " + MONTHS[parseInt(p[1], 10) - 1] + " " + p[0];
  }
  function fmtShort(iso) {
    var p = String(iso).split("-");
    return parseInt(p[2], 10) + " " + MONTHS[parseInt(p[1], 10) - 1];
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  var STATES = [["qld", "Queensland"], ["nsw", "New South Wales"], ["vic", "Victoria"], ["wa", "Western Australia"], ["act", "ACT"], ["other", "SA, Tasmania or NT"]];

  /* The questions the matcher asks, in the order they appear. "step" groups them
     into the three screens of the matcher; "short" names the question in reasons.
     "state" is where you live (state rebates, regional NSW cards); "campus" is
     where you study (city transport concessions follow the campus). */
  var QUESTIONS = [
    { key: "state", step: 1, short: "Where you live", label: "Which state do you live in?", options: STATES },
    { key: "campus", step: 1, short: "Where you study", label: "Which state is your campus in?", options: STATES },
    { key: "uni", step: 1, short: "Your uni", label: "Your university", options: [["qut", "QUT"], ["uq", "University of Queensland"], ["griffith", "Griffith University"], ["scu", "Southern Cross University"], ["other", "Another uni"]] },
    { key: "res", step: 1, short: "Residency", label: "Residency", options: [["citizen", "Australian citizen"], ["pr", "Permanent resident"], ["intl", "International student"]] },
    { key: "age", step: 2, short: "Age", label: "Your age", type: "number" },
    { key: "load", step: 2, short: "Study load", label: "Study load", options: [["full", "Full-time"], ["part", "Part-time"]] },
    { key: "field", step: 2, short: "What you study", label: "What are you studying?", options: [["engineering", "Engineering"], ["it", "IT or computing"], ["business", "Business, accounting or finance"], ["care", "Teaching, nursing, midwifery or social work"], ["other", "Something else"]] },
    { key: "prac", step: 2, short: "Placement", label: "Doing a mandatory placement this year?", options: [["yes", "Yes"], ["no", "No"]] },
    { key: "payment", step: 3, short: "Student payment", label: "Do you get Youth Allowance, Austudy or ABSTUDY?", options: [["yes", "Yes"], ["no", "No"]] },
    { key: "away", step: 3, short: "Moved away", label: "Did you move away from home to study?", options: [["yes", "Yes"], ["no", "No"]] },
    { key: "atsi", step: 3, short: "Aboriginal or Torres Strait Islander", label: "Aboriginal or Torres Strait Islander", skip: "Prefer not to say", options: [["yes", "Yes"], ["no", "No"]] }
  ];
  var STEPS = [
    { n: 1, title: "Where and who", blurb: "Your state, uni and residency decide most payments, fares and scholarships." },
    { n: 2, title: "Your study", blurb: "Age, load and course open up placement support and age-limited offers." },
    { n: 3, title: "Money and housing", blurb: "Optional. These unlock rent help, relocation grants and First Nations support." }
  ];

  function blankProfile() {
    var p = {};
    QUESTIONS.forEach(function (q) { p[q.key] = q.type === "number" ? null : ""; });
    return p;
  }

  function isBlank(v) { return v === null || v === "" || v === undefined; }

  function answeredCount(p) {
    var n = 0;
    QUESTIONS.forEach(function (q) { if (!isBlank(p[q.key])) n++; });
    return n;
  }

  function questionByKey(key) {
    for (var i = 0; i < QUESTIONS.length; i++) if (QUESTIONS[i].key === key) return QUESTIONS[i];
    return null;
  }
  function optionLabel(q, v) {
    if (!q || !q.options) return String(v);
    for (var i = 0; i < q.options.length; i++) if (q.options[i][0] === v) return q.options[i][1];
    return String(v);
  }

  /* One condition against one answer: "yes", "maybe" or "no". */
  function judge(key, cond, v) {
    if (isBlank(v)) return "maybe";
    if (key === "age") {
      return (cond.min != null && v < cond.min) || (cond.max != null && v > cond.max) ? "no" : "yes";
    }
    if (cond.yes || cond.maybe) {
      return (cond.yes || []).indexOf(v) >= 0 ? "yes" : (cond.maybe || []).indexOf(v) >= 0 ? "maybe" : "no";
    }
    if (cond.no) return cond.no.indexOf(v) >= 0 ? "no" : "yes";
    return "maybe";
  }

  /* Each entry's "match" object lists conditions. A blank answer never rules
     anything out; it makes the result "maybe". Any "no" wins, then any "maybe".
     An entry's "cap" can hold the best result at "maybe" when eligibility
     depends on something we don't ask, and any entry not marked verified is
     held at "maybe" too. */
  function evaluate(entry, p) {
    var m = entry.match || {};
    var result = "yes";
    Object.keys(m).forEach(function (key) {
      var r = judge(key, m[key], p[key]);
      if (r === "no") result = "no";
      else if (r === "maybe" && result === "yes") result = "maybe";
    });
    if (entry.cap === "maybe" && result === "yes") result = "maybe";
    if (entry.status !== "verified" && result === "yes") result = "maybe";
    return result;
  }

  function rangeText(cond) {
    if (cond.min != null && cond.max != null) return cond.min + " to " + cond.max;
    if (cond.min != null) return cond.min + " or over";
    return "under " + (cond.max + 1);
  }
  function listText(q, arr) {
    return (arr || []).map(function (v) { return optionLabel(q, v); }).join(" or ");
  }

  /* Why an entry got its verdict, in plain sentences, one per condition.
     Returns { verdict, reasons: [{ t: "yes"|"maybe"|"no", text }] }. */
  function explain(entry, p) {
    var m = entry.match || {}, reasons = [];
    Object.keys(m).forEach(function (key) {
      var q = questionByKey(key), cond = m[key], v = p[key], r = judge(key, cond, v), text;
      if (!q) return;
      if (key === "age") {
        if (r === "maybe") text = "Age: this is for ages " + rangeText(cond) + ". Add your age to check.";
        else if (r === "yes") text = "Age: you're " + v + ", inside the " + rangeText(cond) + " range.";
        else text = "Age: this is for ages " + rangeText(cond) + " and you're " + v + ".";
      } else if (r === "maybe" && isBlank(v)) {
        var need = cond.yes ? listText(q, cond.yes) : cond.no ? "everyone except " + listText(q, cond.no) : "";
        text = q.short + ": you skipped this" + (need ? ". It's for " + need + "." : ".");
      } else if (r === "maybe") {
        text = q.short + ": " + optionLabel(q, v) + " might qualify. Check the details.";
      } else if (r === "yes") {
        text = q.short + ": " + optionLabel(q, v) + " fits.";
      } else {
        var open = cond.yes ? "for " + listText(q, (cond.yes || []).concat(cond.maybe || [])) : "not for " + listText(q, cond.no);
        text = q.short + ": this is " + open + ", and you chose " + optionLabel(q, v) + ".";
      }
      reasons.push({ t: r, text: text, key: key });
    });
    var verdict = evaluate(entry, p);
    if (entry.cap === "maybe") reasons.push({ t: "maybe", text: "It also depends on things we don't ask, such as your course, grades or income. Read \"Who can get it\".", key: "cap" });
    if (entry.status !== "verified") reasons.push({ t: "maybe", text: "We haven't fully confirmed this entry yet, so it never shows as \"Likely for you\".", key: "status" });
    var order = { no: 0, maybe: 1, yes: 2 };
    reasons.sort(function (a, b) { return order[a.t] - order[b.t]; });
    return { verdict: verdict, reasons: reasons };
  }

  /* One short line for a card: what fits, what's missing, or what rules it out. */
  function brief(entry, p) {
    var m = entry.match || {}, yes = [], ask = [], no = [];
    Object.keys(m).forEach(function (key) {
      var q = questionByKey(key), v = p[key], r = judge(key, m[key], v);
      if (!q) return;
      if (r === "yes") yes.push(key === "age" ? "age " + v : optionLabel(q, v).toLowerCase());
      else if (r === "no") no.push(q.short.toLowerCase());
      else ask.push(q.short.toLowerCase());
    });
    if (no.length) return "Doesn't fit: " + no.slice(0, 2).join(", ");
    if (ask.length) return "Check: " + ask.slice(0, 2).join(", ");
    if (yes.length) return "Fits: " + yes.slice(0, 3).join(", ");
    return "";
  }

  /* ---------- Facts shown on cards, worked out once at build time ---------- */
  var KINDS = ["Government", "Uni", "Company", "Professional body"];
  var CLAIMS = ["Apply or sign up", "Show a card or code", "Automatic"];
  var COSTS = ["Free", "Discount", "Money to you"];

  var MONEY = /(up to\s+|from\s+)?(A?\$\s?[\d,]+(?:\.\d{1,2})?(?:\s?(?:k|million))?)/i;
  var PCT = /(up to\s+)?(\d{1,3}(?:\.\d+)?)\s?%\s*(off|discount|cashback|back|saving)/i;
  var FREE = /\b(free|complimentary|no cost|\$0)\b/i;

  function periodOf(text) {
    var m = /^\s*(?:,)?\s*(?:\(?[^)]{0,12}\)?\s*)?(a|an|per|each|every|\/)\s*(week|fortnight|month|year|semester|term|trimester)\b/i.exec(text);
    return m ? "a " + m[2].toLowerCase() : "";
  }

  /* The figure to lead a card with. An entry can set "value" itself. */
  function valueOf(e) {
    if (e.value) return { v: e.value, u: "" };
    var sources = [e.key, (e.numbers && e.numbers[0] ? e.numbers[0][1] : ""), e.summary];
    for (var i = 0; i < sources.length; i++) {
      var t = sources[i];
      if (!t) continue;
      var m = MONEY.exec(t), p = PCT.exec(t), f = FREE.exec(t);
      var pos = function (x) { return x ? x.index : 1e9; };
      var first = Math.min(pos(m), pos(p), pos(f));
      if (first === 1e9) continue;
      if (f && f.index === first) return { v: "Free", u: "" };
      if (p && p.index === first) {
        return { v: (p[1] ? "Up to " : "") + p[2] + (/cashback|back/i.test(p[3]) ? "% back" : "% off"), u: "" };
      }
      var amt = m[2].replace(/\s+/g, "").replace(/^A\$/i, "$").replace(/[,.]+$/, "");
      var lead = m[1] ? (m[1].trim().toLowerCase() === "from" ? "From " : "Up to ") : "";
      return { v: lead + amt, u: periodOf(t.slice(m.index + m[0].length)) };
    }
    return { v: "", u: "" };
  }

  var STATE_WORDS = [
    ["qld", /queensland|\bqld\b|translink|\bqut\b|griffith|\buq\b|james cook|\bjcu\b|\bcqu\b|central queensland|unisq|southern queensland|sunshine coast|\bbond\b|brisbane|gold coast/i],
    ["nsw", /new south wales|\bnsw\b|opal|sydney|unsw|\buts\b|macquarie|western sydney|newcastle|wollongong|charles sturt|southern cross|new england|\bscu\b|\bcsu\b|\bwsu\b|\busyd\b/i],
    ["vic", /victoria\b|\bvic\b|myki|\bptv\b|melbourne|monash|deakin|rmit|la trobe|swinburne|federation|\bvu\b/i],
    ["wa", /western australia|\bwa\b|smartrider|\buwa\b|curtin|murdoch|edith cowan|\becu\b|perth|notre dame/i],
    ["act", /\bact\b|canberra|\banu\b|myway|transport canberra/i],
    ["other", /south australia|\bsa\b|adelaide|flinders|unisa|tasmania|\butas\b|darwin|northern territory|\bcdu\b|metrocard|adelaide metro/i]
  ];

  function statesOf(e, extraText) {
    var set = {};
    var m = e.match || {};
    ["state", "campus"].forEach(function (k) {
      var c = m[k]; if (!c) return;
      (c.yes || []).concat(c.maybe || []).forEach(function (v) { set[v] = true; });
    });
    if (!Object.keys(set).length) {
      var text = [e.provider, e.name, extraText || ""].join(" ");
      STATE_WORDS.forEach(function (sw) { if (sw[1].test(text)) set[sw[0]] = true; });
      /* A university's own award is for that university's state, but a national
         body that happens to mention several states is national. */
      if (Object.keys(set).length > 2) set = {};
    }
    /* Listing five or six states means it applies everywhere. */
    return Object.keys(set).length >= 5 ? [] : Object.keys(set);
  }

  function kindOf(e, host) {
    if (e.kind) return e.kind;
    host = host || "";
    if (/\.gov\.au$/.test(host) || /(government|department of|services australia|taxation office|study ?assist|translink|transport (for|canberra|nsw)|public transport|adelaide metro|metro tasmania|transperth|ambulance)/i.test(e.provider || "")) return "Government";
    if (/\.edu\.au$/.test(host) || /(guild|student union|students' association|student association|\bsrc\b|union)/i.test(e.provider || "") && e.category === "uni") return "Uni";
    if (e.category === "career") return "Professional body";
    return "Company";
  }

  function claimOf(e) {
    if (e.claim) return e.claim;
    var how = (e.how || []).join(" ");
    var all = how + " " + (e.summary || "");
    if (/\b(promo(?:tional)? code|discount code|coupon|use (?:the )?code|enter (?:the )?code|voucher code)\b|\bcode [A-Z0-9]{5,}\b/.test(all)) return "Show a card or code";
    if (/\b(show|present|tap|scan|swipe|use) (?:your |a )?(?:valid )?(?:student|concession|health care|opal|myki|go|smartrider|id|membership)[^.]{0,20}(card|id|pass|ticket)\b/i.test(how)) return "Show a card or code";
    if (/\b(automatic(?:ally)?|no application|nothing to apply|no need to apply|applied for you|assessed automatically)\b/i.test(all)) return "Automatic";
    if (how) return "Apply or sign up";
    return "";
  }

  function costOf(e, value) {
    if (e.cost) return e.cost;
    var name = (e.name || "") + " " + (e.summary || "");
    if (value === "Free" || /^free\b/i.test(e.key || "")) return "Free";
    if (e.category === "payments" || /\b(scholarship|bursary|grant|allowance|payment|rebate|voucher|stipend|reimburse)/i.test(name)) return "Money to you";
    if (/%|discount|off\b|save|concession|cheaper|reduced|student (price|rate|fare)/i.test(name + " " + (e.key || ""))) return "Discount";
    return "";
  }

  /* Everything a card needs beyond the entry's own fields. host = source hostname. */
  function derive(e, host) {
    var val = valueOf(e);
    return {
      v: val.v, vu: val.u,
      kind: kindOf(e, host),
      claim: claimOf(e),
      cost: costOf(e, val.v),
      st: statesOf(e, host),
      host: (host || "").replace(/^www\./, "")
    };
  }

  /* ---------- Deadlines ---------- */
  function daysUntil(iso, today) {
    var a = Date.parse(iso + "T00:00:00Z"), b = Date.parse(today + "T00:00:00Z");
    return Math.round((a - b) / 864e5);
  }
  /* The deadline chip for an entry: { text, cls } or null. */
  function deadline(e, today) {
    var c = e.closes;
    if (!c || c === "ongoing") return c === "ongoing" ? { text: "Ongoing", cls: "ongoing" } : null;
    if (c === "closed") return { text: "Round closed", cls: "closed" };
    var d = daysUntil(c, today);
    if (d < 0) return { text: "Round closed", cls: "closed" };
    if (d === 0) return { text: "Closes today", cls: "soon" };
    if (d <= 14) return { text: "Closes " + fmtShort(c) + " (" + d + (d === 1 ? " day" : " days") + ")", cls: "soon" };
    return { text: "Closes " + fmtShort(c), cls: "open" };
  }

  var STATUS = {
    verified: { cls: "ver", text: function (e) { return "Verified " + fmtDate(e.verified); } },
    rechecking: { cls: "re", text: function () { return "Being rechecked"; } },
    unverified: { cls: "un", text: function () { return "Not confirmed yet"; } }
  };

  function statusBadge(e) {
    var s = STATUS[e.status] || STATUS.unverified;
    return '<span class="badge ' + s.cls + '">' + esc(s.text(e)) + "</span>";
  }

  function verdictBadge(v) {
    if (v === "yes") return '<span class="badge yes">Likely for you</span>';
    if (v === "maybe") return '<span class="badge maybe">Might apply</span>';
    if (v === "no") return '<span class="badge no">Probably not</span>';
    return "";
  }

  /* A coloured square with the provider's first letter. Colours repeat from a
     small set so the grid stays calm; no brand logos are used. */
  var TILE_HUES = [158, 200, 32, 262, 340, 96, 12, 224];
  function tileHue(name) {
    var h = 0, s = String(name || "");
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return TILE_HUES[h % TILE_HUES.length];
  }
  function tileHTML(provider) {
    var letter = (String(provider || "?").replace(/^(the|a)\s+/i, "").charAt(0) || "?").toUpperCase();
    return '<span class="tile" style="--h:' + tileHue(provider) + '" aria-hidden="true">' + esc(letter) + "</span>";
  }

  function stampHTML(e) {
    var text = e.status === "verified" ? "Checked " + fmtShort(e.verified) : e.status === "rechecking" ? "Being rechecked" : "Not confirmed yet";
    return '<p class="stamp ' + esc(STATUS[e.status] ? STATUS[e.status].cls : "un") + '"><span class="dot" aria-hidden="true"></span>' + esc(text) + (e.host ? ' <span class="host">· ' + esc(e.host) + "</span>" : "") + "</p>";
  }

  /* prefix: path back to the site root from the page the card sits on ("" or "../").
     opts: { verdict, brief, saved, today, href } */
  function cardHTML(e, prefix, opts) {
    opts = opts && typeof opts === "object" ? opts : { verdict: opts };
    var dl = deadline(e, opts.today || "2000-01-01");
    var chips = [];
    if (opts.verdict) chips.push(verdictBadge(opts.verdict));
    if (e.kind) chips.push('<span class="chip">' + esc(e.kind) + "</span>");
    if (e.claim) chips.push('<span class="chip">' + esc(e.claim) + "</span>");
    if (dl) chips.push('<span class="chip dl ' + dl.cls + '">' + esc(dl.text) + "</span>");
    if (e.draft) chips.push('<span class="badge draft">Draft</span>');
    var href = opts.href || (prefix + "entry/" + esc(e.id) + ".html");
    return (
      '<article class="card' + (opts.verdict ? " v-" + opts.verdict : "") + '" data-id="' + esc(e.id) + '">' +
        '<div class="card-head">' + tileHTML(e.provider) +
          '<div class="card-id"><h3><a href="' + href + '">' + esc(e.name) + "</a></h3>" +
          '<p class="prov">' + esc(e.provider) + "</p></div>" +
          '<button type="button" class="save' + (opts.saved ? " on" : "") + '" data-save="' + esc(e.id) + '" aria-pressed="' + (opts.saved ? "true" : "false") + '" aria-label="' + (opts.saved ? "Remove " : "Save ") + esc(e.name) + (opts.saved ? " from your list" : " to your list") + '"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 20.5C7 17 2.5 13 2.5 8.7 2.5 6 4.5 4.2 6.9 4.2c2 0 3.7 1 5.1 3 1.4-2 3.1-3 5.1-3 2.4 0 4.4 1.8 4.4 4.5 0 4.3-4.5 8.3-9.5 11.8z" /></svg></button>' +
        "</div>" +
        (e.v ? '<p class="value"><span class="fig">' + esc(e.v) + "</span>" + (e.vu ? ' <span class="per">' + esc(e.vu) + "</span>" : "") + "</p>" : "") +
        '<p class="sum">' + esc(e.summary) + "</p>" +
        (opts.brief ? '<p class="why">' + esc(opts.brief) + "</p>" : "") +
        (chips.length ? '<div class="chips">' + chips.join("") + "</div>" : "") +
        stampHTML(e) +
      "</article>"
    );
  }

  /* ---------- Search: synonyms, prefixes and one-typo tolerance ---------- */
  var SYNONYMS = {
    centrelink: ["youth allowance", "austudy", "abstudy", "services australia"],
    bus: ["transport", "fares"], train: ["transport", "fares"], tram: ["transport", "fares"], ferry: ["transport", "fares"],
    fare: ["fares", "transport"], travel: ["transport", "fares"], commute: ["transport", "fares"],
    laptop: ["laptop", "computer", "mac", "notebook"], computer: ["laptop", "mac"], phone: ["mobile", "iphone"],
    rent: ["rent", "accommodation", "housing", "relocation"], housing: ["accommodation", "rent"], flat: ["rent", "accommodation"],
    hecs: ["help", "student contribution"], loan: ["help", "loan"], debt: ["help", "repayment"],
    money: ["payment", "grant", "bursary", "scholarship"], cash: ["payment", "grant", "bursary"],
    broke: ["hardship", "emergency", "grant", "bursary"], hardship: ["emergency", "grant", "support"],
    food: ["food", "grocery", "meals", "voucher"], groceries: ["food", "grocery", "voucher"],
    doctor: ["gp", "bulk billing", "health"], dentist: ["dental"], mental: ["counselling", "mental health"],
    placement: ["placement", "prac", "work integrated"], prac: ["placement", "prac"],
    cad: ["autocad", "civil 3d", "revit", "solidworks"], engineer: ["engineering", "engineers australia"],
    cinema: ["movie", "cinema", "film"], movies: ["movie", "cinema"], music: ["music", "spotify", "apple music"],
    tax: ["tax", "ato", "deduction"], work: ["job", "career", "employment"], job: ["career", "employment"],
    free: ["free", "complimentary"], cheap: ["discount", "free", "concession"], discount: ["discount", "student pricing"]
  };

  function tokens(text) {
    return String(text || "").toLowerCase().replace(/[^a-z0-9$%]+/g, " ").split(" ").filter(Boolean);
  }

  function within1(a, b) {
    if (Math.abs(a.length - b.length) > 1) return false;
    var i = 0, j = 0, miss = 0;
    while (i < a.length && j < b.length) {
      if (a.charAt(i) === b.charAt(j)) { i++; j++; continue; }
      if (++miss > 1) return false;
      if (a.length > b.length) i++;
      else if (a.length < b.length) j++;
      else { i++; j++; }
    }
    return miss + (a.length - i) + (b.length - j) <= 1;
  }

  /* Builds a search index over the client data. */
  function buildIndex(entries, catName) {
    var vocab = {}, docs = entries.map(function (e) {
      var parts = {
        name: tokens(e.name), prov: tokens(e.provider),
        rest: tokens([e.summary, e.key || "", catName[e.category] || "", (e.tags || []).join(" "), e.kind || "", e.claim || "", e.cost || "", e.v || ""].join(" "))
      };
      Object.keys(parts).forEach(function (k) { parts[k].forEach(function (t) { vocab[t] = true; }); });
      return { e: e, parts: parts };
    });
    return { docs: docs, vocab: Object.keys(vocab) };
  }

  /* All spellings a typed word could mean: itself, synonyms, longer words it
     starts, and words one letter away. Each is a list of word forms, so
     "centrelink" can match "youth allowance" as a phrase of two words. */
  function expand(term, index) {
    var out = [[term]];
    (SYNONYMS[term] || []).forEach(function (s) { out.push(s.split(" ")); });
    if (term.length >= 5 && !index.vocabHas[term]) {
      index.vocab.forEach(function (w) { if (w.length >= 4 && within1(term, w)) out.push([w]); });
    }
    return out;
  }

  function hitIn(tokensArr, form, prefixOk) {
    for (var i = 0; i < tokensArr.length; i++) {
      var ok = true;
      for (var j = 0; j < form.length; j++) {
        var t = tokensArr[i + j];
        if (t === undefined) { ok = false; break; }
        if (!(t === form[j] || (prefixOk && j === form.length - 1 && t.indexOf(form[j]) === 0 && form[j].length >= 2))) { ok = false; break; }
      }
      if (ok) return true;
    }
    return false;
  }

  /* Returns matches best first: [{ e, score }]. Every typed word must match. */
  function search(index, query) {
    var terms = tokens(query);
    if (!terms.length) return null;
    if (!index.vocabHas) { index.vocabHas = {}; index.vocab.forEach(function (w) { index.vocabHas[w] = true; }); }
    var exps = terms.map(function (t) { return expand(t, index); });
    var out = [];
    index.docs.forEach(function (d) {
      var score = 0;
      for (var i = 0; i < exps.length; i++) {
        var best = 0;
        exps[i].forEach(function (forms, k) {
          var weight = k === 0 ? 1 : 0.6;
          forms.length && [["name", 6], ["prov", 3], ["rest", 1]].forEach(function (f) {
            if (hitIn(d.parts[f[0]], forms, k === 0 || forms.length === 1)) best = Math.max(best, f[1] * weight);
          });
        });
        if (!best) return;
        score += best;
        if (i === exps.length - 1) out.push({ e: d.e, score: score });
      }
    });
    return out.sort(function (a, b) { return b.score - a.score || a.e.name.localeCompare(b.e.name); });
  }

  return {
    fmtDate: fmtDate, fmtShort: fmtShort, esc: esc, STATES: STATES, QUESTIONS: QUESTIONS, STEPS: STEPS,
    KINDS: KINDS, CLAIMS: CLAIMS, COSTS: COSTS,
    blankProfile: blankProfile, answeredCount: answeredCount, evaluate: evaluate, explain: explain, brief: brief,
    derive: derive, deadline: deadline, daysUntil: daysUntil,
    cardHTML: cardHTML, statusBadge: statusBadge, verdictBadge: verdictBadge, tileHTML: tileHTML, stampHTML: stampHTML,
    buildIndex: buildIndex, search: search, optionLabel: optionLabel, questionByKey: questionByKey
  };
});
