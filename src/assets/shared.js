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

  var STATES = [["qld", "Queensland"], ["nsw", "New South Wales"], ["vic", "Victoria"], ["wa", "Western Australia"], ["sa", "South Australia"], ["tas", "Tasmania"], ["act", "ACT"], ["nt", "Northern Territory"]];

  /* Every Australian university the matcher knows, grouped by home state, with the
     words that identify it in an entry's text. Entries store the id in "institution". */
  var INSTITUTIONS = [
    ["bond", "Bond University", "Queensland"], ["cqu", "CQUniversity", "Queensland"], ["griffith", "Griffith University", "Queensland"],
    ["jcu", "James Cook University", "Queensland"], ["qut", "QUT", "Queensland"], ["unisq", "University of Southern Queensland (UniSQ)", "Queensland"],
    ["uq", "University of Queensland", "Queensland"], ["usc", "University of the Sunshine Coast", "Queensland"],
    ["csu", "Charles Sturt University", "New South Wales"], ["mq", "Macquarie University", "New South Wales"], ["newcastle", "University of Newcastle", "New South Wales"],
    ["scu", "Southern Cross University", "New South Wales"], ["une", "University of New England", "New South Wales"], ["unsw", "UNSW Sydney", "New South Wales"],
    ["sydney", "University of Sydney", "New South Wales"], ["uts", "UTS", "New South Wales"], ["wsu", "Western Sydney University", "New South Wales"],
    ["uow", "University of Wollongong", "New South Wales"],
    ["deakin", "Deakin University", "Victoria"], ["federation", "Federation University", "Victoria"], ["latrobe", "La Trobe University", "Victoria"],
    ["unimelb", "University of Melbourne", "Victoria"], ["monash", "Monash University", "Victoria"], ["rmit", "RMIT", "Victoria"],
    ["swinburne", "Swinburne University", "Victoria"], ["vu", "Victoria University", "Victoria"],
    ["curtin", "Curtin University", "Western Australia"], ["ecu", "Edith Cowan University", "Western Australia"], ["murdoch", "Murdoch University", "Western Australia"],
    ["uwa", "University of Western Australia", "Western Australia"],
    ["adelaide", "University of Adelaide", "South Australia"], ["flinders", "Flinders University", "South Australia"], ["torrens", "Torrens University", "South Australia"],
    ["unisa", "University of South Australia", "South Australia"],
    ["utas", "University of Tasmania", "Tasmania"],
    ["cdu", "Charles Darwin University", "Northern Territory"],
    ["anu", "Australian National University", "ACT"], ["canberra", "University of Canberra", "ACT"],
    ["acu", "Australian Catholic University", "More than one state"], ["notredame", "University of Notre Dame Australia", "More than one state"]
  ];
  var INST_NAME = {};
  INSTITUTIONS.forEach(function (i) { INST_NAME[i[0]] = i[1]; });
  var UNI_OPTIONS = INSTITUTIONS.map(function (i) { return [i[0], i[1], i[2]]; })
    .concat([["tafe", "TAFE or another VET provider", "Not a uni"], ["apprentice", "Apprentice or trainee", "Not a uni"], ["other", "Another institution (not listed)", "Not a uni"]]);

  /* The questions the matcher asks, in the order they appear. "step" groups them
     into the screens of the matcher; "short" names the question in reasons.
     "state" is where you live (state rebates, regional NSW cards); "campus" is
     where you study (city transport concessions follow the campus). */
  var QUESTIONS = [
    { key: "state", step: 1, short: "Where you live", label: "Which state or territory do you live in?", options: STATES },
    { key: "campus", step: 1, short: "Where you study", label: "Which state or territory is your campus in?", options: STATES },
    { key: "uni", step: 1, short: "Where you study", label: "Where do you study?", options: UNI_OPTIONS },
    { key: "res", step: 1, short: "Residency", label: "Residency", options: [["citizen", "Australian citizen"], ["pr", "Permanent resident"], ["intl", "International student"]] },
    { key: "age", step: 2, short: "Age", label: "Your age", type: "number" },
    { key: "load", step: 2, short: "Study load", label: "Study load", options: [["full", "Full-time"], ["part", "Part-time"]] },
    { key: "level", step: 2, short: "Level of study", label: "Level of study", options: [["ug", "Undergraduate (bachelor's)"], ["pg", "Postgraduate coursework"], ["hdr", "Research degree (Masters or PhD)"]] },
    { key: "year", step: 2, short: "Year of study", label: "Where are you in your course?", options: [["first", "First year"], ["cont", "Second year or later"]] },
    { key: "field", step: 2, short: "What you study", label: "What are you studying?", options: [["engineering", "Engineering"], ["it", "IT or computing"], ["business", "Business, accounting or finance"], ["care", "Teaching, nursing, midwifery or social work"], ["other", "Something else"]] },
    { key: "prac", step: 2, short: "Placement", label: "Doing a mandatory placement this year?", options: [["yes", "Yes"], ["no", "No"]] },
    { key: "payment", step: 3, short: "Student payment", label: "Do you get Youth Allowance, Austudy or ABSTUDY?", options: [["yes", "Yes"], ["no", "No"]] },
    { key: "hcc", step: 3, short: "Concession card", label: "Do you hold a Health Care Card or other concession card?", options: [["yes", "Yes"], ["no", "No"]] },
    { key: "away", step: 3, short: "Moved away", label: "Did you move away from home to study?", options: [["yes", "Yes"], ["no", "No"]] },
    { key: "regional", step: 3, short: "Home area", label: "Is your home in a regional, rural or remote area?", options: [["yes", "Yes, regional, rural or remote"], ["no", "No, a capital or major city"]] },
    { key: "atsi", step: 4, short: "Aboriginal or Torres Strait Islander", label: "Aboriginal or Torres Strait Islander", skip: "Prefer not to say", options: [["yes", "Yes"], ["no", "No"]] },
    { key: "disability", step: 4, short: "Disability or long-term condition", label: "Do you have a disability or long-term health condition?", skip: "Prefer not to say", options: [["yes", "Yes"], ["no", "No"]] },
    { key: "parent", step: 4, short: "Parent or carer", label: "Are you a parent or carer?", options: [["yes", "Yes"], ["no", "No"]] },
    { key: "gender", step: 4, short: "Gender", label: "Gender", skip: "Prefer not to say", options: [["woman", "Woman"], ["man", "Man"], ["nb", "Non-binary or another term"]] }
  ];
  var STEPS = [
    { n: 1, title: "Where and who", blurb: "Your state, uni and residency decide most payments, fares and scholarships." },
    { n: 2, title: "Your study", blurb: "Level, age, load and course open up placement support and age-limited offers." },
    { n: 3, title: "Money and housing", blurb: "Optional. These unlock rent help, relocation grants and regional support." },
    { n: 4, title: "About you", blurb: "Optional. Some awards are for particular groups, such as First Nations students, carers, or women in engineering. Skip anything you'd rather not say." }
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
      if (f && f.index === first) {
        if (/interest[- ]$/i.test(t.slice(Math.max(0, f.index - 9), f.index))) return { v: "Interest-free", u: "", ctx: "" };
        return { v: "Free", u: "", ctx: t.slice(Math.max(0, f.index - 45), f.index + 40) };
      }
      if (p && p.index === first) {
        return { v: (p[1] ? "Up to " : "") + p[2] + (/cashback|back/i.test(p[3]) ? "% back" : "% off"), u: "", ctx: "saving" };
      }
      var amt = m[2].replace(/\s+/g, "").replace(/^A\$/i, "$").replace(/[,.]+$/, "");
      var lead = m[1] ? (m[1].trim().toLowerCase() === "from" ? "From " : "Up to ") : "";
      return { v: lead + amt, u: periodOf(t.slice(m.index + m[0].length)), ctx: t.slice(Math.max(0, m.index - 45), m.index + m[0].length + 30) };
    }
    return { v: "", u: "" };
  }

  var STATE_WORDS = [
    ["qld", /queensland|\bqld\b|translink|\bqut\b|griffith|\buq\b|james cook|\bjcu\b|\bcqu\b|central queensland|unisq|southern queensland|sunshine coast|\bbond\b|brisbane|gold coast/i],
    ["nsw", /new south wales|\bnsw\b|opal|sydney|unsw|\buts\b|macquarie|western sydney|newcastle|wollongong|charles sturt|southern cross|new england|\bscu\b|\bcsu\b|\bwsu\b|\busyd\b/i],
    ["vic", /victoria\b|\bvic\b|myki|\bptv\b|melbourne|monash|deakin|rmit|la trobe|swinburne|federation|\bvu\b/i],
    ["wa", /western australia|\bwa\b|smartrider|\buwa\b|curtin|murdoch|edith cowan|\becu\b|perth|notre dame/i],
    ["act", /\bact\b|canberra|\banu\b|myway|transport canberra/i],
    ["sa", /south australia|\bsa\b|adelaide|flinders|unisa|metrocard|adelaide metro|torrens/i],
    ["tas", /tasmania|\btas\b|\butas\b|metro tasmania|tastafe|hobart/i],
    ["nt", /darwin|northern territory|\bnt\b|\bcdu\b|alice springs|batchelor/i]
  ];

  /* Which states an entry covers. An entry's own "states" list wins; otherwise the
     state and campus rules; otherwise a guess from the provider's name and web address.
     An empty list means it applies everywhere. */
  function statesOf(e, extraText) {
    if (e.states && e.states.length) return e.states.length >= STATES.length ? [] : e.states.slice();
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
    /* Listing most of the states means it applies everywhere. */
    return Object.keys(set).length >= 6 ? [] : Object.keys(set);
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
    if (value === "Free" || value === "Interest-free" || /^free\b/i.test(e.key || "")) return "Free";
    if (e.category === "payments" || /\b(scholarship|bursary|grant|allowance|payment|rebate|voucher|stipend|reimburse)/i.test(name)) return "Money to you";
    if (/%|discount|off\b|save|concession|cheaper|reduced|student (price|rate|fare)/i.test(name + " " + (e.key || ""))) return "Discount";
    return "";
  }

  /* What the headline figure means for the student: money they receive, money they
     save, or money they pay. An entry can set "vlabel" itself when the wording fools this. */
  var PAY_STRICT = /\b(fee|fees|membership|price|priced|charge|charged|joining|subscription)\b/i;
  var PAY_BROAD = /\b(fee|fees|costs?|membership|price|priced|pay|pays|charge|charged|joining|subscription)\b/i;
  function valueLabel(e, val, cost) {
    if (e.vlabel) return e.vlabel;
    if (!val.v || val.v === "Free" || val.v === "Interest-free") return "";
    if (/% (off|back)/.test(val.v)) return "You save";
    var ctx = val.ctx || "";
    if (cost === "Money to you") return PAY_STRICT.test(ctx) && !/scholarship|grant|bursary|allowance|payment/i.test(ctx) ? "You pay" : "You get";
    if (PAY_BROAD.test(ctx)) return "You pay";
    if (cost === "Discount") return "You save";
    return "";
  }

  /* Everything a card needs beyond the entry's own fields. host = source hostname. */
  function derive(e, host) {
    var val = valueOf(e);
    var cost = costOf(e, val.v);
    return {
      v: val.v, vu: val.u,
      vl: valueLabel(e, val, cost),
      kind: kindOf(e, host),
      claim: claimOf(e),
      cost: cost,
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

  /* The "Next check" line on an entry page. */
  function nextCheckText(e, today) {
    var nc = e.nc || e.nextCheck;
    if (!nc) return "";
    return isOverdue(e, today) ? "Due now (was due " + fmtDate(nc) + ")" : fmtDate(nc);
  }

  /* Does an entry belong to one of the "start from your situation" collections? */
  function inCollection(e, c) {
    if (!c) return true;
    if (c.cats && c.cats.indexOf(e.category) >= 0) return true;
    var text = [e.name, e.provider, e.summary, e.key || "", (e.tags || []).join(" ")].join(" ").toLowerCase();
    return (c.any || []).some(function (t) { return text.indexOf(t) >= 0; });
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

  /* A date for a card: "14 Oct", or "14 Oct 2026" once it is not this year. */
  function fmtRecent(iso, today) {
    return today && String(iso).slice(0, 4) !== String(today).slice(0, 4) ? fmtDate(iso) : fmtShort(iso);
  }
  function isOverdue(e, today) {
    var nc = e.nc || e.nextCheck;
    return !!(nc && today && today > nc);
  }
  /* The "Checked 14 Oct" line. Once a check is overdue it says so, instead of
     showing a green dot for a date that is going stale. */
  function stampHTML(e, today) {
    var late = e.status === "verified" && isOverdue(e, today);
    var text = e.status === "verified" ? (late ? "Recheck due. Last checked " : "Checked ") + fmtRecent(e.verified, today) : e.status === "rechecking" ? "Being rechecked" : "Not confirmed yet";
    var cls = late ? "late" : (STATUS[e.status] ? STATUS[e.status].cls : "un");
    return '<p class="stamp ' + esc(cls) + '" data-status="' + esc(e.status) + '" data-ver="' + esc(e.verified) + '" data-nc="' + esc(e.nc || e.nextCheck || "") + '" data-host="' + esc(e.host || "") + '"><span class="dot" aria-hidden="true"></span>' + esc(text) + (e.host ? ' <span class="host">· ' + esc(e.host) + "</span>" : "") + "</p>";
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
    if (dl) chips.push('<span class="chip dl ' + dl.cls + '" data-closes="' + esc(e.closes) + '">' + esc(dl.text) + "</span>");
    if (e.draft) chips.push('<span class="badge draft">Draft</span>');
    var href = opts.href || (prefix + "entry/" + esc(e.id) + ".html");
    return (
      '<article class="card' + (opts.verdict ? " v-" + opts.verdict : "") + '" data-id="' + esc(e.id) + '">' +
        '<div class="card-head">' + tileHTML(e.provider) +
          '<div class="card-id"><h3><a href="' + href + '">' + esc(e.name) + "</a></h3>" +
          '<p class="prov">' + esc(e.provider) + "</p></div>" +
          '<button type="button" class="save' + (opts.saved ? " on" : "") + '" data-save="' + esc(e.id) + '" aria-pressed="' + (opts.saved ? "true" : "false") + '" aria-label="' + (opts.saved ? "Remove " : "Save ") + esc(e.name) + (opts.saved ? " from your list" : " to your list") + '"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 20.5C7 17 2.5 13 2.5 8.7 2.5 6 4.5 4.2 6.9 4.2c2 0 3.7 1 5.1 3 1.4-2 3.1-3 5.1-3 2.4 0 4.4 1.8 4.4 4.5 0 4.3-4.5 8.3-9.5 11.8z" /></svg></button>' +
        "</div>" +
        (e.v ? '<p class="value">' + (e.vl ? '<span class="vl">' + esc(e.vl) + "</span> " : "") + '<span class="fig">' + esc(e.v) + "</span>" + (e.vu ? ' <span class="per">' + esc(e.vu) + "</span>" : "") + "</p>" : "") +
        '<p class="sum">' + esc(e.summary) + "</p>" +
        (opts.brief ? '<p class="why">' + esc(opts.brief) + "</p>" : "") +
        (chips.length ? '<div class="chips">' + chips.join("") + "</div>" : "") +
        stampHTML(e, opts.today) +
      "</article>"
    );
  }

  /* ---------- Search: synonyms, prefixes and one-typo tolerance ---------- */
  /* Each typed word can also mean the words listed here. Keep these narrow: a
     synonym that is itself a common word ("help", "support") matches half the site. */
  var SYNONYMS = {
    centrelink: ["youth allowance", "austudy", "abstudy", "services australia"],
    bus: ["transport", "fares"], train: ["transport", "fares"], tram: ["transport", "fares"], ferry: ["transport", "fares"],
    fare: ["fares", "transport"], travel: ["transport", "fares"], commute: ["transport", "fares"],
    laptop: ["laptop", "computer", "mac", "notebook"], computer: ["laptop", "mac"], phone: ["mobile", "iphone"],
    rent: ["rent", "accommodation", "housing", "relocation"], housing: ["accommodation", "rent"], flat: ["rent", "accommodation"],
    hecs: ["hecs-help", "hecs help", "help loan", "student contribution"], loan: ["loan", "loans"], debt: ["help debt", "help repayment", "repayment", "repayments"],
    unisa: ["university of south australia", "unisa"],
    money: ["payment", "grant", "bursary", "scholarship"], cash: ["payment", "grant", "bursary"],
    broke: ["hardship", "emergency"], hardship: ["hardship", "emergency"],
    food: ["food", "grocery", "meals", "voucher"], groceries: ["food", "grocery", "voucher"],
    doctor: ["gp", "bulk billing", "health"], dentist: ["dental"], mental: ["counselling", "mental health"], medicare: ["medicare", "bulk billing", "health care card"],
    electricity: ["energy", "electricity"], power: ["energy", "electricity"], gas: ["energy", "gas"], water: ["water", "sewerage"], bills: ["energy", "electricity", "water", "utilities"],
    placement: ["placement", "prac", "work integrated"], prac: ["placement", "prac"],
    cad: ["autocad", "civil 3d", "revit", "solidworks"], engineer: ["engineering", "engineers australia"],
    cinema: ["movie", "cinema", "film"], movies: ["movie", "cinema"], music: ["music", "spotify", "apple music"],
    tax: ["tax", "ato", "deduction"], work: ["job", "career", "employment"], job: ["career", "employment"],
    free: ["free", "complimentary"], cheap: ["discount", "free", "concession"], discount: ["discount", "student pricing"],
    chatgpt: ["openai", "chatgpt", "ai"], ai: ["ai", "openai", "chatgpt", "copilot", "gemini"],
    gym: ["gym", "fitness", "health club"], apprentice: ["apprentice", "apprenticeship", "trainee"], apprenticeship: ["apprentice", "apprenticeship", "trainee"]
  };
  /* Whole searches that mean something specific. */
  var PHRASES = {
    "power bill": ["energy", "electricity"], "electricity bill": ["energy", "electricity"], "energy bill": ["energy", "electricity"],
    "water bill": ["water", "sewerage"],
    "go card": ["go card", "translink"], "help debt": ["help debt", "help repayment", "repayment"], "free tafe": ["fee-free tafe", "free tafe"],
    "student loan": ["help loan", "student start-up loan", "loan"], "health care card": ["health care card"]
  };
  /* Entries to put first for common searches. Ids that don't exist are ignored. */
  var PINS = {
    rent: ["rent-assistance"], hecs: ["hecs-help"], help: ["hecs-help", "help-repayment-2026-27"],
    youth: ["youth-allowance"], austudy: ["austudy"], abstudy: ["abstudy"], centrelink: ["youth-allowance", "austudy", "abstudy"],
    opal: ["nsw-tertiary-opal"], myki: ["vic-myki-health-care-card-concession"], "health care card": ["health-care-card-students"], tax: ["self-education-deductions"]
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

  /* Builds a search index over the client data. The category name is not searched:
     it made "tafe" match every entry in "Scholarships, uni and TAFE help". */
  function buildIndex(entries) {
    var vocab = {}, docs = entries.map(function (e) {
      var parts = {
        name: tokens(e.name), prov: tokens(e.provider + " " + (INST_NAME[e.inst] || "")),
        rest: tokens([e.summary, e.key || "", (e.tags || []).join(" "), e.kind || "", e.claim || "", e.cost || "", e.v || ""].join(" "))
      };
      Object.keys(parts).forEach(function (k) { parts[k].forEach(function (t) { vocab[t] = true; }); });
      return { e: e, parts: parts };
    });
    return { docs: docs, vocab: Object.keys(vocab) };
  }

  /* All spellings a typed word could mean: itself, synonyms, and (for long words
     not found anywhere) words one letter away. Each is a list of word forms, so
     "centrelink" can match "youth allowance" as a phrase of two words. */
  function expand(term, index) {
    var out = [[term]];
    (SYNONYMS[term] || []).forEach(function (s) { out.push(tokens(s)); });
    if (term.length >= 6 && !index.vocabHas[term]) {
      index.vocab.forEach(function (w) { if (w.length >= 5 && within1(term, w)) out.push([w]); });
    }
    return out;
  }

  /* 1 for a whole-word match, 0.5 for a word that starts with what was typed (only
     the word still being typed, and only from three letters), 0 for none. */
  function hitIn(tokensArr, form, prefixOk) {
    var best = 0;
    for (var i = 0; i < tokensArr.length; i++) {
      var ok = 1;
      for (var j = 0; j < form.length; j++) {
        var t = tokensArr[i + j];
        if (t === undefined) { ok = 0; break; }
        if (t === form[j]) continue;
        if (prefixOk && j === form.length - 1 && form[j].length >= 3 && t.indexOf(form[j]) === 0) { ok = Math.min(ok, 0.5); continue; }
        ok = 0; break;
      }
      if (ok > best) best = ok;
      if (best === 1) break;
    }
    return best;
  }

  function searchTerms(terms, index) {
    var exps = terms.map(function (t) { return expand(t, index); });
    var out = [];
    index.docs.forEach(function (d) {
      var score = 0;
      for (var i = 0; i < exps.length; i++) {
        var best = 0, last = i === exps.length - 1;
        exps[i].forEach(function (forms, k) {
          var weight = k === 0 ? 1 : 0.6;
          [["name", 6], ["prov", 3], ["rest", 1]].forEach(function (f) {
            var h = hitIn(d.parts[f[0]], forms, last && (k === 0 || forms.length === 1));
            if (h) best = Math.max(best, f[1] * weight * h);
          });
        });
        if (!best) return;
        score += best;
      }
      out.push({ e: d.e, score: score });
    });
    return out;
  }

  /* Returns matches best first: [{ e, score }]. Every typed word must match. */
  function search(index, query) {
    var terms = tokens(query);
    if (!terms.length) return null;
    if (!index.vocabHas) { index.vocabHas = {}; index.vocab.forEach(function (w) { index.vocabHas[w] = true; }); }
    var key = terms.join(" "), out = searchTerms(terms, index);
    if (PHRASES[key]) {
      var seen = {};
      out.forEach(function (r) { seen[r.e.id] = r; });
      PHRASES[key].forEach(function (alt) {
        searchTerms(tokens(alt), index).forEach(function (r) {
          if (seen[r.e.id]) seen[r.e.id].score = Math.max(seen[r.e.id].score, r.score * 0.8);
          else { seen[r.e.id] = { e: r.e, score: r.score * 0.8 }; out.push(seen[r.e.id]); }
        });
      });
    }
    var pins = PINS[key] || (terms.length === 1 ? PINS[terms[0]] : null);
    if (pins) out.forEach(function (r) { var at = pins.indexOf(r.e.id); if (at >= 0) r.score += 100 - at; });
    return out.sort(function (a, b) { return b.score - a.score || a.e.name.localeCompare(b.e.name); });
  }

  return {
    fmtDate: fmtDate, fmtShort: fmtShort, esc: esc, STATES: STATES, QUESTIONS: QUESTIONS, STEPS: STEPS,
    KINDS: KINDS, CLAIMS: CLAIMS, COSTS: COSTS,
    blankProfile: blankProfile, answeredCount: answeredCount, evaluate: evaluate, explain: explain, brief: brief,
    derive: derive, deadline: deadline, daysUntil: daysUntil,
    cardHTML: cardHTML, nextCheckText: nextCheckText, inCollection: inCollection, fmtRecent: fmtRecent, isOverdue: isOverdue, INSTITUTIONS: INSTITUTIONS, INST_NAME: INST_NAME, statusBadge: statusBadge, verdictBadge: verdictBadge, tileHTML: tileHTML, stampHTML: stampHTML,
    buildIndex: buildIndex, search: search, optionLabel: optionLabel, questionByKey: questionByKey
  };
});
