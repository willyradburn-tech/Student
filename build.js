#!/usr/bin/env node
/* Builds the static site from data/ into dist/ (or preview/ with --preview).
   No dependencies: run with `node build.js`.

   Public build: only entries with "review": "approved".
   Preview build (--preview): every entry, with unapproved ones marked Draft,
   so you can review them on the real pages before they go live. */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Hub = require("./src/assets/shared.js");

const args = process.argv.slice(2);
const PREVIEW = args.includes("--preview");
const OUT = path.join(__dirname, PREVIEW ? "preview" : "dist");
const ROOT = __dirname;
const esc = Hub.esc;

const config = JSON.parse(fs.readFileSync(path.join(ROOT, "site.config.json"), "utf8"));
const cats = JSON.parse(fs.readFileSync(path.join(ROOT, "data/categories.json"), "utf8"));
const catById = Object.fromEntries(cats.map((c) => [c.id, c]));

/* ---------- Load and check entries ---------- */
const { validateEntry, CADENCE_DAYS } = require("./src/validate.js");
const categoryIds = new Set(cats.map((c) => c.id));
const problems = [];
const today = new Date().toISOString().slice(0, 10);

function addDays(iso, n) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const dir = path.join(ROOT, "data/entries");
let all = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => {
  const e = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  const where = "data/entries/" + f;
  if (e.id + ".json" !== f) problems.push(where + ": id should match the file name");
  problems.push(...validateEntry(e, categoryIds, where));
  e.nextCheck = addDays(e.verified, CADENCE_DAYS[e.cadence] || 30);
  e.draft = e.review !== "approved";
  return e;
});

if (problems.length) {
  console.error("Build stopped. Fix these first:\n  " + problems.join("\n  "));
  process.exit(1);
}

const drafts = all.filter((e) => e.draft);
const entries = PREVIEW ? all : all.filter((e) => !e.draft);
if (!PREVIEW) entries.forEach((e) => { e.draft = false; });
entries.sort((a, b) => a.name.localeCompare(b.name));
/* Facts shown on cards (value, who offers it, how to claim, cost, state, host),
   worked out from each entry once, here, so the browser doesn't have to. */
for (const e of all) Object.assign(e, Hub.derive(e, new URL(e.source.url).hostname));

/* ---------- Assets ---------- */
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "assets"), { recursive: true });
fs.mkdirSync(path.join(OUT, "entry"), { recursive: true });
fs.mkdirSync(path.join(OUT, "category"), { recursive: true });

const clientData = {
  cats: cats,
  entries: entries.map((e) => ({
    id: e.id, name: e.name, provider: e.provider, category: e.category, summary: e.summary,
    key: e.key || null, status: e.status, verified: e.verified, match: e.match || {},
    cap: e.cap || null, tags: e.tags || [], draft: !!e.draft,
    v: e.v, vu: e.vu, kind: e.kind, claim: e.claim, cost: e.cost, st: e.st, host: e.host, closes: e.closes || null
  })),
  collections: config.collections || [],
  today: today
};
const assets = {
  "style.css": fs.readFileSync(path.join(ROOT, "src/assets/style.css"), "utf8"),
  "shared.js": fs.readFileSync(path.join(ROOT, "src/assets/shared.js"), "utf8"),
  "app.js": fs.readFileSync(path.join(ROOT, "src/assets/app.js"), "utf8"),
  "data.js": "window.HUB_DATA = " + JSON.stringify(clientData) + ";\n"
};
const ver = crypto.createHash("sha1").update(Object.values(assets).join("")).digest("hex").slice(0, 8);
for (const [name, body] of Object.entries(assets)) fs.writeFileSync(path.join(OUT, "assets", name), body);

/* ---------- Layout ---------- */
const FONTS = "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=Instrument+Sans:wght@400;500;600&display=swap";
const latest = entries.reduce((m, e) => (e.verified > m ? e.verified : m), "0000-00-00");

/* Where "Report something out of date" goes: our own form page (Netlify Forms),
   an external form URL, or nowhere if reportForm is empty. */
function reportHref(prefix, id) {
  const rf = config.reportForm || "";
  if (rf === "netlify") return prefix + "report.html" + (id ? "?entry=" + encodeURIComponent(id) : "");
  if (/^https:\/\//.test(rf)) return rf;
  return "";
}

/* Optional, cookie-free analytics. Never added to the preview build. */
function analyticsTag() {
  const a = config.analytics || {};
  if (PREVIEW) return "";
  if (a.provider === "plausible" && a.domain) return `<script defer data-domain="${esc(a.domain)}" src="https://plausible.io/js/script.js"></script>\n`;
  if (a.provider === "cloudflare" && a.token) return `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${esc(a.token)}"}'></script>\n`;
  return "";
}

const ICON = {
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  find: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  browse: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/></svg>',
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5C7 17 2.5 13 2.5 8.7 2.5 6 4.5 4.2 6.9 4.2c2 0 3.7 1 5.1 3 1.4-2 3.1-3 5.1-3 2.4 0 4.4 1.8 4.4 4.5 0 4.3-4.5 8.3-9.5 11.8z"/></svg>'
};

function layout({ title, description, prefix, page, body, urlPath, current, cat }) {
  const full = title ? title + " · " + config.name : config.name;
  const canonical = config.siteUrl ? config.siteUrl.replace(/\/$/, "") + "/" + urlPath : "";
  const link = (href, label, key, cls) => '<a' + (cls ? ' class="' + cls + '"' : "") + ' href="' + prefix + href + '"' + (current === key ? ' aria-current="page"' : "") + ">" + label + "</a>";
  const catLinks = usedCats.map((c) => '<a href="' + prefix + "category/" + c.id + '.html"' + (cat === c.id ? ' aria-current="page"' : "") + ">" + esc(c.short) + '<span class="n">' + counts[c.id] + "</span></a>").join("");
  return `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(full)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:title" content="${esc(full)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
${canonical ? `<link rel="canonical" href="${esc(canonical)}">\n<meta property="og:url" content="${esc(canonical)}">\n` : ""}${PREVIEW ? '<meta name="robots" content="noindex">\n' : ""}<meta name="theme-color" content="#0B6B4F">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%23FFD84D'/%3E%3Ctext x='16' y='22' font-family='Arial' font-weight='800' font-size='17' text-anchor='middle' fill='%2310211B'%3ES%3C/text%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<link rel="stylesheet" href="${prefix}assets/style.css?v=${ver}">
${analyticsTag()}</head>
<body data-page="${page}" data-prefix="${prefix}">
<a class="skip" href="#main">Skip to content</a>
<header class="site-head">
  <div class="wrap bar">
    <a class="brand" href="${prefix}index.html"><span class="brand-mark" aria-hidden="true">S</span>${esc(config.name)}</a>
    <form class="hsearch" id="hsearch" role="search" action="${prefix}index.html#results" method="get">
      <label class="sr" for="hq">Search concessions</label>
      <input id="hq" name="q" type="search" placeholder="Search Opal, rent, laptop, Youth Allowance" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="hq-list" aria-autocomplete="list">
      <button type="submit" aria-label="Search">${ICON.search}</button>
      <ul class="suggest" id="hq-list" role="listbox" hidden></ul>
    </form>
    <nav class="top-links" aria-label="Main">${link("index.html#matcher", "Find yours", "find", "hide-sm")}<a href="${prefix}saved.html"${current === "saved" ? ' aria-current="page"' : ""}>Saved<span class="count-pill" id="saved-count" data-n="0"></span></a>${link("about.html", "How we check", "about", "hide-sm")}</nav>
  </div>
  <nav class="catbar" aria-label="Categories"><div class="wrap">${catLinks}</div></nav>
</header>
<main class="wrap" id="main">
${body}
</main>
<footer class="site-foot"><div class="wrap">
  <nav aria-label="Footer">${link("index.html", "Home", "")}${link("saved.html", "Saved list", "")}${link("about.html", "About and how we check", "")}${link("privacy.html", "Privacy", "")}${reportHref(prefix) ? `<a href="${reportHref(prefix)}">Report something out of date</a>` : ""}</nav>
  <p>General information only, not financial, tax or legal advice. Rules and amounts change and your situation may differ, so confirm on the official page before you apply or rely on a figure.</p>
  <p>Coverage: ${esc(config.coverage)}. Last checked ${esc(Hub.fmtDate(latest))}.${config.contactEmail ? ` Contact: <span class="sel">${esc(config.contactEmail)}</span>.` : ""}</p>
</div></footer>
<nav class="tabbar" aria-label="Quick links">
  <a href="${prefix}index.html#matcher"${current === "find" ? ' aria-current="page"' : ""}>${ICON.find}Find yours</a>
  <a href="${prefix}index.html#browse">${ICON.browse}Browse</a>
  <a href="${prefix}saved.html"${current === "saved" ? ' aria-current="page"' : ""}>${ICON.heart}Saved<span class="count-pill" data-mirror="saved-count" data-n="0"></span></a>
  <button type="button" id="tab-search">${ICON.search}Search</button>
</nav>
<script src="${prefix}assets/shared.js?v=${ver}"></script>
<script src="${prefix}assets/data.js?v=${ver}"></script>
<script src="${prefix}assets/app.js?v=${ver}"></script>
</body>
</html>
`;
}

const draftNotice = PREVIEW
  ? `<p class="notice draft"><b>Preview build.</b> Entries marked Draft are waiting for review and are left out of the public site. ${drafts.length} drafts in total.</p>`
  : "";

/* ---------- Shared pieces ---------- */
function field(q) {
  const id = "f-" + q.key;
  if (q.type === "number") {
    return `<div class="field"><label for="${id}">${esc(q.label)}</label><input id="${id}" type="number" min="14" max="99" inputmode="numeric" placeholder="e.g. 21"></div>`;
  }
  const opts = [`<option value="">${esc(q.skip || "Skip")}</option>`]
    .concat(q.options.map((o) => `<option value="${esc(o[0])}">${esc(o[1])}</option>`)).join("");
  return `<div class="field"><label for="${id}">${esc(q.label)}</label><select id="${id}">${opts}</select></div>`;
}

const byName = (a, b) => (a.status === "unverified") - (b.status === "unverified") || a.name.localeCompare(b.name);
const cardOpts = { today };

function groupsHTML(list, prefix) {
  return cats.map((c) => {
    const items = list.filter((e) => e.category === c.id).sort(byName);
    if (!items.length) return "";
    return `<section class="group" id="g-${c.id}" aria-labelledby="h-${c.id}">
<div class="group-head"><h2 id="h-${c.id}">${esc(c.name)} <span class="ct">${items.length}</span></h2><a class="more" href="${prefix}category/${c.id}.html" aria-label="View all in ${esc(c.name)}">View all</a></div>
<div class="cards">${items.slice(0, 6).map((e) => Hub.cardHTML(e, prefix, cardOpts)).join("")}</div>${items.length > 6 ? `<a class="show-more" href="${prefix}category/${c.id}.html">See all ${items.length}</a>` : ""}
</section>`;
  }).join("\n");
}

const counts = Object.fromEntries(cats.map((c) => [c.id, entries.filter((e) => e.category === c.id).length]));
const usedCats = cats.filter((c) => counts[c.id] > 0);
const verifiedCount = entries.filter((e) => e.status === "verified").length;

/* The official sites most entries link to, so the home page can show what "checked against the source" means. */
const hostCounts = {};
for (const e of entries) if (e.status === "verified" && /\.(gov|edu)\.au$/.test(e.host)) hostCounts[e.host] = (hostCounts[e.host] || 0) + 1;
const topHosts = Object.entries(hostCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map((h) => h[0]);

const FAQ = [
  ["Is it free, and do I need an account?", "It's free and there's no account. Everything you see here, including how to claim, the conditions and the official link, is open without signing in."],
  ["Where does the information come from?", "Only from the page run by whoever gives the concession: a government agency, your uni, or the company itself. Blogs, deal sites, forums and AI summaries are never used as a source."],
  ["How often is it checked?", "Company offers every two weeks, payments and concessions every month, tax and HELP tables every three months. Each card shows the date it was last checked and the site it was checked on."],
  ["Does \"Likely for you\" mean I'll get it?", "No. It means you seem to meet the main conditions we track. Many awards also depend on grades, income or your course, so read the conditions and confirm on the official page before you apply."],
  ["Does anyone pay to be listed?", "No. Money never changes which entries appear, how they're ordered or what verdict they get. Any link that ever earns a commission will be labelled."],
  ["What do you do with my answers?", "They stay in your browser. The matcher runs on your device and nothing is sent to us. Your saved list works the same way, and lives only on this device."]
];

/* ---------- Home ---------- */
const homeBody = `
${draftNotice}
<section class="hero">
  <h1>What can you claim as a uni student?</h1>
  <p class="lede">Government payments, HELP and tax, cheaper fares, scholarships and student pricing. Every entry links to the official page it came from, and says when it was last checked.</p>
  <div class="cta-row">
    <a class="btn" href="#matcher">Find yours</a>
    <p class="facts"><b>${entries.length}</b> entries, <b>${verifiedCount}</b> checked against the source. No sign-up.</p>
  </div>
  <p class="quick"><span>Popular:</span><a href="index.html?q=Youth+Allowance#results">Youth Allowance</a><a href="index.html?q=rent#results">Rent help</a><a href="index.html?q=laptop#results">Laptops</a><a href="index.html?q=transport#results">Fares</a><a href="index.html?q=scholarship#results">Scholarships</a><a href="index.html?q=software#results">Free software</a></p>
</section>

<section class="sources" aria-label="Sites entries are checked against">
  <p>Every entry is checked against a page like these:</p>
  <ul>${topHosts.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>
</section>

<form class="panel" id="matcher" aria-labelledby="matcher-h">
  <div class="panel-head"><h2 id="matcher-h">What could you get?</h2><p>Answer what you like. Skip the rest. Your answers stay in this browser.</p></div>
  <div class="stepper-bar" id="stepper-bar" role="group" aria-label="Steps">${Hub.STEPS.map((st) => `<button type="button" data-step="${st.n}">${st.n}. ${esc(st.title)}</button>`).join("")}</div>
  ${Hub.STEPS.map((st) => `<fieldset class="step" data-step="${st.n}"><legend>${esc(st.title)}</legend><p class="blurb">${esc(st.blurb)}</p><div class="fields">${Hub.QUESTIONS.filter((q) => q.step === st.n).map(field).join("")}</div></fieldset>`).join("\n  ")}
  <div class="panel-foot"><p class="tally" id="tally" aria-live="polite">Answer any question to sort the list.</p><div class="step-nav"><button class="btn ghost small" type="button" id="step-back">Back</button><button class="btn small" type="button" id="step-next">Next</button></div><button class="linkish" type="button" id="reset">Clear answers</button></div>
</form>

<section class="directory" id="browse" aria-labelledby="browse-h">
  <h2 id="browse-h">Browse by what you need</h2>
  <ul class="dir">${usedCats.map((c) => `<li><a href="category/${c.id}.html">${esc(c.name)} <span class="ct">${counts[c.id]}</span></a></li>`).join("")}</ul>
</section>

<div id="results">
${groupsHTML(entries, "")}
</div>

<section aria-labelledby="faq-h"><h2 class="section-title" id="faq-h">Questions</h2>
<div class="faq">${FAQ.map((f) => `<details><summary>${esc(f[0])}</summary><p>${esc(f[1])}</p></details>`).join("")}</div></section>
`;
fs.writeFileSync(path.join(OUT, "index.html"), layout({
  title: "", description: config.tagline, prefix: "", page: "home", body: homeBody, urlPath: "", current: "find"
}));

/* ---------- Category pages ---------- */
for (const c of usedCats) {
  const items = entries.filter((e) => e.category === c.id).sort(byName);
  const body = `
${draftNotice}
<div class="page-head">
  <p class="crumbs"><a href="../index.html">Home</a><span aria-hidden="true">/</span><a href="../index.html#browse">Browse</a><span aria-hidden="true">/</span><span>${esc(c.short)}</span></p>
  <h1>${esc(c.name)}</h1>
  <p class="lede">${esc(c.note)}</p>
  <p class="gn" id="fit-note" hidden>Sorted using the answers you gave on the home page. <a href="../index.html#matcher">Change your answers</a></p>
</div>
<div id="filters" data-category="${c.id}"></div>
<div class="cards" id="list">${items.map((e) => Hub.cardHTML(e, "../", cardOpts)).join("")}</div>
`;
  fs.writeFileSync(path.join(OUT, "category", c.id + ".html"), layout({
    title: c.name, description: c.note, prefix: "../", page: "category", body, urlPath: "category/" + c.id + ".html", current: "browse", cat: c.id
  }));
}

/* ---------- Saved list ---------- */
fs.writeFileSync(path.join(OUT, "saved.html"), layout({
  title: "Your saved list", description: "Concessions you've saved on this device.", prefix: "", page: "saved", urlPath: "saved.html", current: "saved",
  body: `
<div class="page-head">
  <p class="crumbs"><a href="index.html">Home</a><span aria-hidden="true">/</span><span>Saved</span></p>
  <h1>Your saved list</h1>
  <p class="lede" id="saved-lede">Concessions you've saved, with the ones closing soonest first.</p>
  <div class="saved-actions" id="saved-actions" hidden><button class="btn small" type="button" id="saved-print">Print</button><button class="btn ghost small" type="button" id="saved-copy">Copy as text</button><button class="linkish" type="button" id="saved-clear">Clear list</button></div>
  <p class="saved-note">Your list is kept in this browser only. Nothing is sent to us, and it won't follow you to another device.</p>
</div>
<div class="cards" id="saved-list"></div>
<div class="empty" id="saved-empty" hidden><h3>Nothing saved yet</h3><p>Tap the heart on any card to keep it here. Answer a few questions and we'll show which ones are likely for you.</p><a class="btn small" href="index.html#matcher">Find yours</a></div>
`
}));

/* ---------- Entry pages ---------- */
function listBlock(title, items, cls) {
  if (!items || !items.length) return "";
  return `<section class="block${cls ? " " + cls : ""}"><h2>${esc(title)}</h2><ul>${items.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></section>`;
}
const STATUS_TEXT = {
  verified: "Verified against the official source.",
  rechecking: "Being rechecked. Something on the source changed or couldn't be confirmed, so treat the details with care.",
  unverified: "Not confirmed yet. We know this exists but couldn't confirm the details. Use the official page for the rules."
};

/* Related entries: more from the same provider first, then the closest in the same category. */
function relatedFor(e) {
  const same = entries.filter((o) => o.provider === e.provider && o.id !== e.id).sort(byName).slice(0, 3);
  const taken = new Set([e.id].concat(same.map((o) => o.id)));
  const tags = new Set(e.tags || []);
  const near = entries.filter((o) => o.category === e.category && !taken.has(o.id))
    .map((o) => ({ o, s: (o.tags || []).filter((t) => tags.has(t)).length + (o.kind === e.kind ? 1 : 0) + (o.claim === e.claim ? 0.5 : 0) }))
    .sort((a, b) => b.s - a.s || a.o.name.localeCompare(b.o.name)).slice(0, 3).map((x) => x.o);
  return { same, near };
}

for (const e of entries) {
  const c = catById[e.category];
  const rel = relatedFor(e);
  const steps = e.how && e.how.length
    ? `<section class="block"><h2>How to claim</h2><ol class="steps">${e.how.map((t) => `<li><span>${esc(t)}</span></li>`).join("")}</ol></section>` : "";
  const numbers = e.numbers && e.numbers.length
    ? `<section class="block"><h2>The numbers</h2><div class="tbl"><table><tbody>${e.numbers.map((r) => `<tr><th scope="row">${esc(r[0])}</th><td>${esc(r[1])}</td></tr>`).join("")}</tbody></table></div></section>` : "";
  const extra = (e.extra_sources || []).map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.label)}</a>`).join("");
  const dl = Hub.deadline(e, today);
  const chips = [e.kind, e.claim, e.cost].filter(Boolean).map((t) => `<span class="chip">${esc(t)}</span>`).join("") + (dl ? `<span class="chip dl ${dl.cls}">${esc(dl.text)}</span>` : "");
  const body = `
${e.draft ? '<p class="notice draft"><b>Draft.</b> This entry is waiting for review and is not on the public site yet.</p>' : ""}
<div class="entry">
  <article class="entry-main">
    <div class="entry-head">
      <p class="crumbs"><a href="../index.html">Home</a><span aria-hidden="true">/</span><a href="../category/${c.id}.html">${esc(c.name)}</a></p>
      <div class="id-row">${Hub.tileHTML(e.provider)}<p class="prov">${esc(e.provider)}</p></div>
      <h1>${esc(e.name)}</h1>
      <p class="sum">${esc(e.summary)}</p>
      <div class="chips">${chips}</div>
      ${e.status !== "verified" ? `<p class="notice">${esc(STATUS_TEXT[e.status])}</p>` : ""}
      <div class="fit" id="fit" data-id="${esc(e.id)}" hidden></div>
    </div>
    ${e.v || e.key ? `<div class="hero-value">${e.v ? `<p class="value"><span class="fig">${esc(e.v)}</span>${e.vu ? ` <span class="per">${esc(e.vu)}</span>` : ""}</p>` : ""}${e.key ? `<p>${esc(e.key)}</p>` : ""}</div>` : ""}
    ${listBlock("Who can get it", e.who)}
    ${numbers}
    ${listBlock("What you'll need", e.need)}
    ${steps}
    ${listBlock("Conditions and catches", e.catches, "catches")}
  </article>
  <aside class="aside" aria-label="Official source">
    <h2>Official source</h2>
    <a class="go" href="${esc(e.source.url)}" target="_blank" rel="noopener noreferrer">Open the official page</a>
    <button type="button" class="save-btn" data-save="${esc(e.id)}" aria-pressed="false">Save to my list</button>
    <p class="src">${esc(e.source.label)}</p>
    <dl class="meta">
      <dt>Checked on</dt><dd>${esc(e.host)}</dd>
      <dt>Last checked</dt><dd>${esc(Hub.fmtDate(e.verified))}</dd>
      <dt>Next check</dt><dd>${esc(Hub.fmtDate(e.nextCheck))}</dd>
      ${dl ? `<dt>Applications</dt><dd>${esc(dl.text)}</dd>` : ""}
      <dt>Category</dt><dd>${esc(c.short)}</dd>
    </dl>
    ${extra ? `<p class="src">Also checked: ${extra}</p>` : ""}
    <p class="small">Confirm amounts and rules on the official page before you apply.</p>
    ${reportHref("../", e.id) ? `<a class="report" href="${reportHref("../", e.id)}">Report something out of date</a>` : ""}
  </aside>
</div>
${rel.same.length ? `<section class="related" aria-labelledby="rel1-h"><h2 class="section-title" id="rel1-h">More from ${esc(e.provider)}</h2><div class="cards">${rel.same.map((o) => Hub.cardHTML(o, "../", cardOpts)).join("")}</div></section>` : ""}
${rel.near.length ? `<section class="related" aria-labelledby="rel2-h"><h2 class="section-title" id="rel2-h">Also in ${esc(c.name)}</h2><div class="cards">${rel.near.map((o) => Hub.cardHTML(o, "../", cardOpts)).join("")}</div></section>` : ""}
`;
  fs.writeFileSync(path.join(OUT, "entry", e.id + ".html"), layout({
    title: e.name, description: e.summary, prefix: "../", page: "entry", body, urlPath: "entry/" + e.id + ".html", current: "", cat: e.category
  }));
}

/* ---------- About ---------- */
const aboutBody = `
<div class="page-head">
  <p class="crumbs"><a href="index.html">Home</a></p>
  <h1>How we check every entry</h1>
  <p class="lede">Concessions are easy to miss and easy to get wrong, because amounts and rules change. This is how we keep the list honest.</p>
</div>
<div class="prose">
  <h2>Official sources only</h2>
  <p>Every claim on an entry comes from a page run by the people who give the concession: Services Australia, the Department of Social Services, the ATO, Study Assist, a state transport body, a university, or the company itself. Blogs, deal sites, forums and AI summaries are never used as a source.</p>
  <h2>Rechecked on a schedule</h2>
  <ul>
    <li>Company offers and fast-moving items: every two weeks.</li>
    <li>Government payments, concessions and uni help: every month.</li>
    <li>Tax and HELP tables: every three months, and when the new financial year starts.</li>
  </ul>
  <p>An automated check reads each official page when the entry is due, compares it with what we publish, and flags anything that changed. A second, independent check looks for disagreement. A person approves every change to an amount or a rule before it goes live.</p>
  <h2>What the labels mean</h2>
  <dl class="legend">
    <dt><span class="badge ver">Verified</span></dt><dd>Every detail shown matched the official page on the date given.</dd>
    <dt><span class="badge re">Being rechecked</span></dt><dd>Something on the source changed, or two official pages disagree. The details shown are the ones we could still confirm.</dd>
    <dt><span class="badge un">Not confirmed yet</span></dt><dd>We know it exists, but couldn't confirm the details. Use the official page.</dd>
    <dt><span class="badge yes">Likely for you</span></dt><dd>Based on your answers, you seem to meet the main conditions we track. It is not a guarantee.</dd>
    <dt><span class="badge maybe">Might apply</span></dt><dd>It depends on something you skipped, something we don't ask about, or an entry we're still rechecking.</dd>
  </dl>
  <h2>Your answers stay with you</h2>
  <p>The questions on the home page are worked out in your browser. Your answers are kept on this device so the site remembers them between pages, and are never sent to us. Use Clear answers to remove them.</p>
  <h2>Spotted a mistake?</h2>
  <p>Rules change between our checks. ${reportHref("") ? `<a href="${reportHref("")}">Report something out of date</a> and we'll recheck that entry against the source.` : "Tell us and we'll recheck that entry against the source."}</p>
  <h2>No one pays to be listed</h2>
  <p>Entries are chosen because students can use them. Money never changes the order of results, the verdicts or an entry's status.</p>
  ${config.ownerName ? `<h2>Who runs this site</h2>
  <p>${esc(config.name)} is run by ${esc(config.ownerName)}${config.ownerBlurb ? ", " + esc(config.ownerBlurb) : ""}.${config.contactEmail ? ` You can reach us at <span class="sel">${esc(config.contactEmail)}</span>.` : ""}</p>` : ""}
  <h2>This is not advice</h2>
  <p>This site is general information. It is not financial, tax or legal advice, and it can't account for your full situation. Always confirm with the official source before you apply or rely on a figure.</p>
</div>
`;
fs.writeFileSync(path.join(OUT, "about.html"), layout({
  title: "How we check", description: "How every entry is sourced, rechecked and approved.", prefix: "", page: "about", body: aboutBody, urlPath: "about.html", current: "about"
}));

/* ---------- Privacy ---------- */
const an = config.analytics || {};
const analyticsOn = !!((an.provider === "plausible" && an.domain) || (an.provider === "cloudflare" && an.token));
const analyticsName = an.provider === "plausible" ? "Plausible" : "Cloudflare Web Analytics";
const privacyBody = `
<div class="page-head">
  <p class="crumbs"><a href="index.html">Home</a></p>
  <h1>Privacy</h1>
  <p class="lede">We collect as little as we can. Here is everything this site does with information about you.</p>
</div>
<div class="prose">
  <h2>Your answers to the questions</h2>
  <p>Your answers are worked out in your browser and saved on your device only, so the site remembers them between pages. They are never sent to us. Clear answers on the home page deletes them. If you use the heart to save concessions, that list is kept on your device in the same way, and Clear list on the Saved page removes it.</p>
  ${config.reportForm === "netlify" ? `<h2>Reports you send</h2>
  <p>If you use the report form, we receive the entry you picked, what you wrote, any link you added and, only if you give it, your email address. The form is processed by our web host, Netlify. We use reports only to fix entries, and we use your email only to reply to you.</p>` : ""}
  <h2>Visits</h2>
  ${analyticsOn ? `<p>We count visits with ${analyticsName}, which doesn't use cookies or collect personal information. It tells us which pages are read and what people search for, so we know what to check and add next.</p>` : `<p>We don't run analytics or advertising trackers.</p>`}
  <p>Our fonts load from Google Fonts, which receives your IP address as part of the request, as any website does.</p>
  <h2>What we never do</h2>
  <ul><li>Sell or share information about you.</li><li>Use advertising cookies.</li><li>Ask for your Centrelink, tax or bank details.</li></ul>
  ${config.contactEmail ? `<h2>Questions</h2><p>Email <span class="sel">${esc(config.contactEmail)}</span>.</p>` : ""}
</div>
`;
fs.writeFileSync(path.join(OUT, "privacy.html"), layout({
  title: "Privacy", description: "What this site does with information about you.", prefix: "", page: "privacy", body: privacyBody, urlPath: "privacy.html", current: ""
}));

/* ---------- Report form (Netlify Forms) ---------- */
if (config.reportForm === "netlify") {
  const options = entries.map((e) => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join("");
  const reportBody = `
<div class="page-head">
  <p class="crumbs"><a href="index.html">Home</a></p>
  <h1>Report something out of date</h1>
  <p class="lede">Tell us what's changed and we'll check it against the official source. A link to where you saw the new detail helps most.</p>
</div>
<form class="panel report-form" name="report" method="POST" action="thanks.html" data-netlify="true" netlify-honeypot="bot-field">
  <input type="hidden" name="form-name" value="report">
  <p hidden><label>Leave this empty <input name="bot-field"></label></p>
  <div class="field"><label for="r-entry">Which entry?</label><select id="r-entry" name="entry" required><option value="">Choose an entry</option>${options}<option value="other">Something not listed</option></select></div>
  <div class="field"><label for="r-what">What's wrong or changed?</label><textarea id="r-what" name="message" rows="5" required placeholder="For example: the rate went up on 20 September, or this offer has ended."></textarea></div>
  <div class="field"><label for="r-link">Link to where you saw it (optional)</label><input id="r-link" name="link" type="url" placeholder="https://"></div>
  <div class="field"><label for="r-email">Your email, if you'd like a reply (optional)</label><input id="r-email" name="email" type="email" autocomplete="email"></div>
  <div class="panel-foot"><button class="btn" type="submit">Send report</button><p class="tally">We read every report. See <a href="privacy.html">Privacy</a> for what happens to it.</p></div>
</form>
`;
  fs.writeFileSync(path.join(OUT, "report.html"), layout({
    title: "Report something out of date", description: "Tell us when a concession changes.", prefix: "", page: "report", body: reportBody, urlPath: "report.html", current: ""
  }));
  fs.writeFileSync(path.join(OUT, "thanks.html"), layout({
    title: "Thanks", description: "Report received.", prefix: "", page: "thanks", urlPath: "thanks.html", current: "",
    body: `<div class="page-head"><h1>Thanks, we've got it</h1><p class="lede">We'll recheck that entry against the official source. <a href="index.html">Back to the home page</a></p></div>`
  }));
}

fs.writeFileSync(path.join(OUT, "404.html"), layout({
  title: "Page not found", description: config.tagline, prefix: "/", page: "404", urlPath: "404.html", current: "",
  body: `<div class="page-head"><h1>That page isn't here</h1><p class="lede">It may have moved or been removed. <a href="/index.html">Go to the home page</a> or search from there.</p></div>`
}));

/* ---------- Robots and sitemap ---------- */
if (PREVIEW) {
  fs.writeFileSync(path.join(OUT, "robots.txt"), "User-agent: *\nDisallow: /\n");
} else {
  const base = (config.siteUrl || "").replace(/\/$/, "");
  fs.writeFileSync(path.join(OUT, "robots.txt"), "User-agent: *\nAllow: /\n" + (base ? "Sitemap: " + base + "/sitemap.xml\n" : ""));
  if (base) {
    const urls = ["", "about.html", "privacy.html", "saved.html"].concat(usedCats.map((c) => "category/" + c.id + ".html"), entries.map((e) => "entry/" + e.id + ".html"));
    fs.writeFileSync(path.join(OUT, "sitemap.xml"), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urls.map((u) => "  <url><loc>" + esc(base + "/" + u) + "</loc></url>").join("\n") + "\n</urlset>\n");
  }
}

/* ---------- Report ---------- */
const overdue = all.filter((e) => e.nextCheck < today);
console.log(`${PREVIEW ? "Preview" : "Public"} build: ${entries.length} entries in ${usedCats.length} categories -> ${path.relative(ROOT, OUT)}/`);
if (!PREVIEW && drafts.length) console.log(`  ${drafts.length} draft entries left out (run with --preview to see them): ${drafts.map((e) => e.id).join(", ")}`);
if (!PREVIEW) {
  const todo = [];
  if (!config.siteUrl) todo.push("set siteUrl in site.config.json (turns on canonical links and the sitemap)");
  if (!config.ownerName) todo.push("set ownerName so the About page says who runs the site");
  if (!config.contactEmail) todo.push("set contactEmail for the footer and privacy page");
  if (!analyticsOn) todo.push("optional: set analytics (plausible domain or cloudflare token)");
  if (todo.length) console.log("  Before launch: " + todo.join("; "));
}
if (overdue.length) console.log(`  Overdue for a recheck: ${overdue.map((e) => e.id + " (due " + e.nextCheck + ")").join(", ")}`);
