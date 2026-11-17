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
    v: e.v, vu: e.vu, vl: e.vl, kind: e.kind, claim: e.claim, cost: e.cost, st: e.st, host: e.host, closes: e.closes || null,
    nc: e.nextCheck, inst: e.institution || null
  })),
  collections: config.collections || [],
  today: today
};
const assets = {
  "style.css": fs.readFileSync(path.join(ROOT, "src/assets/style.css"), "utf8"),
  "shared.js": fs.readFileSync(path.join(ROOT, "src/assets/shared.js"), "utf8"),
  "app.js": fs.readFileSync(path.join(ROOT, "src/assets/app.js"), "utf8"),
  "theme.js": fs.readFileSync(path.join(ROOT, "src/assets/theme.js"), "utf8"),
  "data.js": "window.HUB_DATA = " + JSON.stringify(clientData) + ";\n"
};
const ver = crypto.createHash("sha1").update(Object.values(assets).join("")).digest("hex").slice(0, 8);
for (const [name, body] of Object.entries(assets)) fs.writeFileSync(path.join(OUT, "assets", name), body);
// Self-hosted fonts (SIL Open Font License) and the social share image: no third-party requests.
fs.mkdirSync(path.join(OUT, "assets", "fonts"), { recursive: true });
for (const f of fs.readdirSync(path.join(ROOT, "src/assets/fonts"))) fs.copyFileSync(path.join(ROOT, "src/assets/fonts", f), path.join(OUT, "assets", "fonts", f));
for (const f of ["og-image.png", "icon-192.png", "icon-512.png", "apple-touch-icon.png"]) {
  if (fs.existsSync(path.join(ROOT, "src/assets", f))) fs.copyFileSync(path.join(ROOT, "src/assets", f), path.join(OUT, "assets", f));
}
fs.writeFileSync(path.join(OUT, "manifest.webmanifest"), JSON.stringify({
  name: config.name, short_name: config.name, description: config.tagline, lang: "en-AU", start_url: "/index.html", scope: "/", display: "standalone",
  background_color: "#F3F5EF", theme_color: "#0B6B4F",
  icons: [{ src: "/assets/icon-192.png", sizes: "192x192", type: "image/png" }, { src: "/assets/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" }]
}, null, 2) + "\n");

/* ---------- Layout ---------- */
const SITE = (config.siteUrl || "").replace(/\/$/, "");
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
  if (a.provider === "umami" && a.token) return `<script defer src="https://cloud.umami.is/script.js" data-website-id="${esc(a.token)}"></script>\n`;
  if (a.provider === "cloudflare" && a.token) return `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${esc(a.token)}"}'></script>\n`;
  return "";
}

const ICON = {
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  find: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  browse: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/></svg>',
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5C7 17 2.5 13 2.5 8.7 2.5 6 4.5 4.2 6.9 4.2c2 0 3.7 1 5.1 3 1.4-2 3.1-3 5.1-3 2.4 0 4.4 1.8 4.4 4.5 0 4.3-4.5 8.3-9.5 11.8z"/></svg>'
};

function layout({ title, description, prefix, page, body, urlPath, current, cat, jsonld, data, noindex, ogTitle }) {
  const full = title ? title + " · " + config.name : config.name;
  const canonical = config.siteUrl ? config.siteUrl.replace(/\/$/, "") + "/" + urlPath : "";
  const link = (href, label, key, cls) => '<a' + (cls ? ' class="' + cls + '"' : "") + ' href="' + prefix + href + '"' + (current === key ? ' aria-current="page"' : "") + ">" + label + "</a>";
  return `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(full)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:title" content="${esc(ogTitle || full)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(config.name)}">
<meta property="og:locale" content="en_AU">
${SITE ? `<meta property="og:image" content="${SITE}/assets/og-image.png">\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n<meta property="og:image:alt" content="${esc(config.name)}: every concession you can claim as an Australian uni or TAFE student, checked against the official page">\n` : ""}<meta name="twitter:card" content="summary_large_image">
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, "\\u003c")}</script>\n` : ""}${canonical ? `<link rel="canonical" href="${esc(canonical)}">\n<meta property="og:url" content="${esc(canonical)}">\n` : ""}${PREVIEW || noindex ? '<meta name="robots" content="noindex">\n' : ""}<meta name="theme-color" content="#0B6B4F">
<link rel="manifest" href="${prefix}manifest.webmanifest">
<link rel="icon" href="${prefix}assets/icon-192.png" type="image/png" sizes="192x192">
<link rel="apple-touch-icon" href="${prefix}assets/apple-touch-icon.png">
<link rel="preload" href="${prefix}assets/fonts/bricolage-grotesque.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${prefix}assets/fonts/instrument-sans-400.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${prefix}assets/style.css?v=${ver}">
<script src="${prefix}assets/theme.js?v=${ver}"></script>
${analyticsTag()}</head>
<body data-page="${page}" data-prefix="${prefix}" data-ver="${ver}"${data ? ' data-eager="1"' : ""}>
<a class="skip" href="#main">Skip to content</a>
<header class="site-head">
  <div class="wrap bar">
    <a class="brand" href="${prefix}index.html"><span class="brand-mark" aria-hidden="true">S</span>${esc(config.name)}</a>
    <form class="hsearch" id="hsearch" role="search" action="${prefix}index.html#results" method="get">
      <label class="sr" for="hq">Search concessions</label>
      <input id="hq" name="q" type="search" placeholder="Search Opal, rent, laptop, Youth Allowance" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="hq-list" aria-autocomplete="list">
      <button type="submit" aria-label="Search">${ICON.search}</button>
      <ul class="suggest" id="hq-list" role="listbox" aria-label="Suggestions" hidden></ul>
    </form>
    <nav class="top-links" aria-label="Main"><a class="hide-sm" href="${prefix}index.html#browse"${current === "browse" ? ' aria-current="page"' : ""}>Browse</a><a href="${prefix}saved.html"${current === "saved" ? ' aria-current="page"' : ""}>Saved<span class="count-pill" id="saved-count" data-n="0"></span></a></nav>
  </div>
</header>
<main class="wrap" id="main">
${body}
</main>
<footer class="site-foot"><div class="wrap">
  <nav aria-label="Footer">${link("index.html", "Home", "")}${link("saved.html", "Saved list", "")}${link("about.html", "About and how we check", "")}${link("terms.html", "Terms and corrections", "")}${link("privacy.html", "Privacy", "")}${reportHref(prefix) ? `<a href="${reportHref(prefix)}">Report something out of date</a>` : ""}<button type="button" class="linkish" id="theme-btn" aria-label="Colour theme: automatic. Press to change.">Theme: auto</button></nav>
  <p>General information only, not financial, tax or legal advice. Rules and amounts change and your situation may differ, so confirm on the official page before you apply or rely on a figure.</p>
  <p>Coverage: ${esc(config.coverage)}. Newest check: ${esc(Hub.fmtDate(latest))}.${config.contactEmail ? ` Contact: <span class="sel">${esc(config.contactEmail)}</span>.` : ""}</p>
</div></footer>
<nav class="tabbar" aria-label="Quick links">
  <a href="${prefix}index.html#matcher"${current === "find" ? ' aria-current="page"' : ""}>${ICON.find}Find yours</a>
  <a href="${prefix}index.html#browse">${ICON.browse}Browse</a>
  <a href="${prefix}saved.html"${current === "saved" ? ' aria-current="page"' : ""}>${ICON.heart}Saved<span class="count-pill" data-mirror="saved-count" data-n="0"></span></a>
  <button type="button" id="tab-search">${ICON.search}Search</button>
</nav>
<script src="${prefix}assets/shared.js?v=${ver}"></script>
${data ? `<script src="${prefix}assets/data.js?v=${ver}"></script>\n` : ""}<script src="${prefix}assets/app.js?v=${ver}"></script>
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
  let opts = `<option value="">${esc(q.skip || "Skip")}</option>`;
  if (q.options[0] && q.options[0][2]) {
    const groups = [];
    q.options.forEach((o) => { let g = groups.find((x) => x[0] === o[2]); if (!g) groups.push(g = [o[2], []]); g[1].push(o); });
    opts += groups.map((g) => `<optgroup label="${esc(g[0])}">${g[1].map((o) => `<option value="${esc(o[0])}">${esc(o[1])}</option>`).join("")}</optgroup>`).join("");
  } else opts += q.options.map((o) => `<option value="${esc(o[0])}">${esc(o[1])}</option>`).join("");
  return `<div class="field"><label for="${id}">${esc(q.label)}</label><select id="${id}">${opts}</select></div>`;
}

const byName = (a, b) => (a.status === "unverified") - (b.status === "unverified") || a.name.localeCompare(b.name);
const cardOpts = { today };
const SSR_CARDS = 60;

const counts = Object.fromEntries(cats.map((c) => [c.id, entries.filter((e) => e.category === c.id).length]));
const usedCats = cats.filter((c) => counts[c.id] > 0);
const verifiedCount = entries.filter((e) => e.status === "verified").length;

/* Landing pages: one per university with a few entries, per state, and per situation. */
const instCounts = {};
entries.forEach((e) => { if (e.institution) instCounts[e.institution] = (instCounts[e.institution] || 0) + 1; });
const instPages = Hub.INSTITUTIONS.filter((i) => instCounts[i[0]] >= 3).map((i) => ({ id: i[0], name: i[1], state: i[2], n: instCounts[i[0]] }));
const statePages = Hub.STATES.map((st) => ({ id: st[0], name: st[1], items: entries.filter((e) => e.st && e.st.includes(st[0])) })).filter((s) => s.items.length >= 3);
const situations = (config.collections || []).map((c) => ({ id: c.id, name: c.name, blurb: c.blurb, c, items: entries.filter((e) => Hub.inCollection(e, c)) })).filter((c) => c.items.length);

const FAQ = [
  ["Is it free, and do I need an account?", "It's free and there's no account. Everything you see here, including how to claim, the conditions and the official link, is open without signing in."],
  ["Where does the information come from?", "Only from the page run by whoever gives the concession: a government agency, your uni, or the company itself. Blogs, deal sites, forums and AI summaries are never used as a source."],
  ["How often is it checked?", "Each entry is rechecked against its official page on a schedule that matches how fast it tends to change: about every six weeks for company offers and other fast-moving items, every three months for most payments and concessions, and every six months for slow-moving rules. Every entry shows the date it was last checked, and says so when a check is overdue."],
  ["Does \"Likely for you\" mean I'll get it?", "No. It means you seem to meet the main conditions we track. Many awards also depend on grades, income or your course, so read the conditions and confirm on the official page before you apply."],
  ["Does anyone pay to be listed?", "No. Money never changes which entries appear, how they're ordered or what verdict they get. Any link that ever earns a commission will be labelled, and is never used on a government, uni or study-support entry."],
  ["What do you do with my answers?", "They stay in your browser. The matcher runs on your device and nothing is sent to us. Your saved list works the same way, and lives only on this device."]
];

/* Cards, filter bar and list for any page that lists entries. scope tells the browser which entries to show. */
function listBody({ crumbs, h1, lede, items, scope, extra }) {
  const sorted = items.slice().sort(byName);
  const rest = sorted.length > SSR_CARDS
    ? `<details class="all-list"><summary>All ${sorted.length} entries as a list</summary><ul class="plain">${sorted.map((e) => `<li><a href="../entry/${esc(e.id)}.html">${esc(e.name)}</a> <span class="prov">${esc(e.provider)}</span></li>`).join("")}</ul></details>` : "";
  return `
${draftNotice}
<div class="page-head">
  <p class="crumbs">${crumbs}</p>
  <h1>${esc(h1)}</h1>
  <p class="lede">${esc(lede)}</p>
  <p class="gn" id="fit-note" hidden>Sorted using the answers you gave on the home page. <a href="../index.html#matcher">Change your answers</a></p>
</div>
<div id="filters" data-scope="${esc(scope)}"></div>
<h2 class="sr">Entries</h2>
<div class="cards" id="list">${sorted.slice(0, SSR_CARDS).map((e) => Hub.cardHTML(e, "../", cardOpts)).join("")}</div>
${rest}
${extra || ""}`;
}
const crumb = (...parts) => parts.map((p, i) => i < parts.length - 1 ? `<a href="${p[1]}">${esc(p[0])}</a><span aria-hidden="true">/</span>` : `<span>${esc(p[0])}</span>`).join("");
function otherCats(exceptId) {
  return `<section class="directory" aria-labelledby="more-cats-h"><h2 id="more-cats-h">Other categories</h2>
<ul class="dir">${usedCats.filter((o) => o.id !== exceptId).map((o) => `<li><a href="../category/${o.id}.html">${esc(o.name)} <span class="ct">${counts[o.id]}</span></a></li>`).join("")}</ul></section>`;
}

function writePage(rel, html) {
  const full = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, html);
}
const pagePaths = [];   // for the sitemap: [urlPath, lastmod]
const newest = (list) => list.reduce((m, e) => (e.verified > m ? e.verified : m), "0000-00-00");

/* ---------- Home ---------- */
const hostCounts = {};
for (const e of entries) if (e.status === "verified" && /\.(gov|edu)\.au$/.test(e.host)) hostCounts[e.host] = (hostCounts[e.host] || 0) + 1;

const noscriptList = `<noscript><div class="nojs"><p class="notice">The questions and search need JavaScript. You can still browse every entry below.</p>${usedCats.map((c) => {
  const items = entries.filter((e) => e.category === c.id).sort(byName);
  return `<section class="group"><h2>${esc(c.name)} <span class="ct">${items.length}</span></h2><ul class="plain">${items.slice(0, 8).map((e) => `<li><a href="entry/${esc(e.id)}.html">${esc(e.name)}</a> <span class="prov">${esc(e.provider)}</span></li>`).join("")}</ul><a class="more" href="category/${c.id}.html">See all ${items.length}</a></section>`;
}).join("")}</div></noscript>`;

const homeBody = `
${draftNotice}
<section class="hero">
  <h1>What can you claim as a student?</h1>
  <p class="lede">Government payments, HELP and tax, cheaper fares, scholarships and student pricing. Every entry links to the official page it came from, and says when it was last checked.</p>
  <div class="cta-row">
    <a class="btn" href="#matcher">Find yours</a>
    <p class="facts"><b>${entries.length}</b> entries, <b>${verifiedCount}</b> checked against the source. No sign-up.</p>
  </div>
  <p class="quick"><span>Popular:</span><a href="index.html?q=rent#results">Rent help</a><a href="index.html?q=scholarship#results">Scholarships</a><a href="index.html?q=transport#results">Fares</a><a href="category/tafe.html">TAFE</a></p>
</section>

<form class="panel" id="matcher" aria-labelledby="matcher-h">
  <div class="panel-head"><h2 id="matcher-h">What could you get?</h2><p>Answer what you like. Skip the rest. Your answers stay in this browser.</p></div>
  <div class="stepper-bar" id="stepper-bar" role="group" aria-label="Steps">${Hub.STEPS.map((st) => `<button type="button" data-step="${st.n}">${st.n}. ${esc(st.title)}</button>`).join("")}</div>
  ${Hub.STEPS.map((st) => `<fieldset class="step" data-step="${st.n}"><legend>${esc(st.title)}</legend><p class="blurb">${esc(st.blurb)}</p><div class="fields">${Hub.QUESTIONS.filter((q) => q.step === st.n).map(field).join("")}</div></fieldset>`).join("\n  ")}
  <div class="panel-foot"><p class="tally" id="tally" aria-live="polite">Answer any question to sort the list.</p><div class="step-nav"><button class="btn ghost small" type="button" id="step-back">Back</button><button class="btn small" type="button" id="step-next">Next</button></div><button class="linkish" type="button" id="reset">Clear answers</button></div>
</form>

${noscriptList}
<div id="results"></div>

<section class="directory" id="browse" aria-labelledby="browse-h">
  <h2 id="browse-h">Browse by what you need</h2>
  <ul class="dir">${usedCats.map((c) => `<li><a href="category/${c.id}.html">${esc(c.name)} <span class="ct">${counts[c.id]}</span></a></li>`).join("")}</ul>
  <h3 class="dir-h">By university</h3>
  <ul class="dir">${instPages.map((i) => `<li><a href="uni/${i.id}.html">${esc(i.name)} <span class="ct">${i.n}</span></a></li>`).join("")}</ul>
  <h3 class="dir-h">By state or territory</h3>
  <ul class="dir">${statePages.map((st) => `<li><a href="state/${st.id}.html">${esc(st.name)} <span class="ct">${st.items.length}</span></a></li>`).join("")}</ul>
  <h3 class="dir-h">By situation</h3>
  <ul class="dir">${situations.map((c) => `<li><a href="situation/${c.id}.html">${esc(c.name)} <span class="ct">${c.items.length}</span></a></li>`).join("")}</ul>
</section>

<section aria-labelledby="faq-h"><h2 class="section-title" id="faq-h">Questions</h2>
<div class="faq">${FAQ.map((f) => `<details><summary>${esc(f[0])}</summary><p>${esc(f[1])}</p></details>`).join("")}</div></section>
`;
const orgLd = { "@type": "Organization", name: config.name, url: SITE + "/", logo: SITE + "/assets/icon-512.png" };
if (config.contactEmail) orgLd.email = config.contactEmail;
writePage("index.html", layout({
  title: "", description: config.tagline, prefix: "", page: "home", body: homeBody, urlPath: "", current: "find", data: true,
  jsonld: SITE ? { "@context": "https://schema.org", "@graph": [
    { "@type": "WebSite", name: config.name, url: SITE + "/", description: config.tagline, inLanguage: "en-AU", publisher: orgLd,
      potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: SITE + "/index.html?q={search_term_string}#results" }, "query-input": "required name=search_term_string" } },
    orgLd] } : null
}));
pagePaths.push(["", latest]);

/* ---------- Category and landing pages ---------- */
for (const c of usedCats) {
  const items = entries.filter((e) => e.category === c.id);
  const body = listBody({ crumbs: crumb(["Home", "../index.html"], ["Browse", "../index.html#browse"], [c.short]), h1: c.name, lede: c.note, items, scope: "category:" + c.id, extra: otherCats(c.id) });
  writePage("category/" + c.id + ".html", layout({ title: c.name, description: c.note + " " + items.length + " entries, each checked against the official page.", prefix: "../", page: "category", body, urlPath: "category/" + c.id + ".html", current: "browse", cat: c.id, data: true }));
  pagePaths.push(["category/" + c.id + ".html", newest(items)]);
}
for (const i of instPages) {
  const items = entries.filter((e) => e.institution === i.id);
  const body = listBody({ crumbs: crumb(["Home", "../index.html"], ["Browse", "../index.html#browse"], [i.name]), h1: i.name + ": scholarships, grants and student help",
    lede: `${items.length} scholarships, grants, free services and discounts from ${i.name}, each linked to the official page it came from. For payments and concessions that apply wherever you study, see the home page.`, items, scope: "inst:" + i.id, extra: otherCats("") });
  writePage("uni/" + i.id + ".html", layout({ title: i.name + " scholarships, grants and student help", description: `${items.length} ${i.name} scholarships, bursaries, hardship grants and free student services, each checked against the official page.`, prefix: "../", page: "category", body, urlPath: "uni/" + i.id + ".html", current: "browse", data: true }));
  pagePaths.push(["uni/" + i.id + ".html", newest(items)]);
}
for (const st of statePages) {
  const body = listBody({ crumbs: crumb(["Home", "../index.html"], ["Browse", "../index.html#browse"], [st.name]), h1: "Student concessions in " + st.name,
    lede: `${st.items.length} concessions, fares, rebates and support that apply in ${st.name}. National payments such as Youth Allowance apply here too: answer the questions on the home page to see them.`, items: st.items, scope: "state:" + st.id, extra: otherCats("") });
  writePage("state/" + st.id + ".html", layout({ title: "Student concessions in " + st.name, description: `${st.items.length} student concessions, transport fares, rebates and scholarships in ${st.name}, each checked against the official page.`, prefix: "../", page: "category", body, urlPath: "state/" + st.id + ".html", current: "browse", data: true }));
  pagePaths.push(["state/" + st.id + ".html", newest(st.items)]);
}
for (const c of situations) {
  const body = listBody({ crumbs: crumb(["Home", "../index.html"], ["Browse", "../index.html#browse"], [c.name]), h1: c.name, lede: c.blurb + " " + c.items.length + " entries, each checked against the official page.", items: c.items, scope: "situation:" + c.id, extra: otherCats("") });
  writePage("situation/" + c.id + ".html", layout({ title: c.name + ": student help", description: c.blurb + " " + c.items.length + " entries for Australian students.", prefix: "../", page: "category", body, urlPath: "situation/" + c.id + ".html", current: "browse", data: true }));
  pagePaths.push(["situation/" + c.id + ".html", newest(c.items)]);
}

/* ---------- Saved list ---------- */
writePage("saved.html", layout({
  title: "Your saved list", description: "Concessions you've saved on this device.", prefix: "", page: "saved", urlPath: "saved.html", current: "saved", data: true, noindex: true,
  body: `
<div class="page-head">
  <p class="crumbs"><a href="index.html">Home</a><span aria-hidden="true">/</span><span>Saved</span></p>
  <h1>Your saved list</h1>
  <p class="lede" id="saved-lede">Concessions you've saved, with the ones closing soonest first.</p>
  <div class="saved-actions" id="saved-actions" hidden><button class="btn small" type="button" id="saved-print">Print</button><button class="btn ghost small" type="button" id="saved-copy">Copy as text</button><button class="linkish" type="button" id="saved-clear">Clear list</button></div>
  <p class="saved-note">Your list is kept in this browser only. Nothing is sent to us, and it won't follow you to another device.</p>
</div>
<h2 class="sr">Saved entries</h2>
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

/* "What the source says": the exact sentences our checks found on the official page. */
function evidenceBlock(e) {
  const seen = new Set();
  const items = (e.evidence || []).slice().reverse().filter((x) => {
    const q = (x.quote || "").trim();
    if (q.length < 8 || seen.has(q.toLowerCase())) return false;
    seen.add(q.toLowerCase()); return true;
  }).slice(0, 4);
  if (!items.length) return "";
  const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (err) { return ""; } };
  return `<section class="block evidence" aria-labelledby="ev-h"><h2 id="ev-h">What the source says</h2>
<p class="ev-note">Exact words quoted from the official page when we checked it. Last checked ${esc(Hub.fmtDate(e.verified))}.</p>
${items.map((x) => `<figure class="quote"><blockquote>${esc(x.quote.trim())}</blockquote><figcaption>${x.url && x.url !== e.source.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(hostOf(x.url))}</a>` : esc(hostOf(e.source.url))}</figcaption></figure>`).join("")}
</section>`;
}

/* A page title and description written for search results: who it is from, the figure, how fresh. */
function entryTitle(e) {
  const fig = e.v && e.vl !== "You pay" ? " – " + e.v + (e.vu ? " " + e.vu : "") : "";
  const prov = e.provider && !e.name.toLowerCase().includes(e.provider.toLowerCase().split(/\s+/)[0]) ? " (" + e.provider + ")" : "";
  let t = e.name + fig + prov;
  if (t.length > 62) t = e.name + fig;
  if (t.length > 62) t = e.name;
  return t;
}
function entryDesc(e) {
  let d = e.provider + ": " + e.summary.replace(/\s+/g, " ").trim();
  if (e.key && !d.includes(e.key.slice(0, 30))) d += " " + e.key.trim();
  d += " Checked " + Hub.fmtDate(e.verified) + " against the official page.";
  if (d.length > 158) { d = d.slice(0, 157); d = d.slice(0, d.lastIndexOf(" ")) + "…"; }
  return d;
}

const ICONS_OK = fs.existsSync(path.join(ROOT, "src/assets/icon-512.png"));
for (const e of entries) {
  const c = catById[e.category];
  const rel = relatedFor(e);
  const steps = e.how && e.how.length
    ? `<section class="block"><h2>How to claim</h2><ol class="steps">${e.how.map((t) => `<li><span>${esc(t)}</span></li>`).join("")}</ol></section>` : "";
  const numbers = e.numbers && e.numbers.length
    ? `<section class="block"><h2 id="num-h">The numbers</h2><div class="tbl" tabindex="0" role="region" aria-labelledby="num-h"><table><tbody>${e.numbers.map((r) => `<tr><th scope="row">${esc(r[0])}</th><td>${esc(r[1])}</td></tr>`).join("")}</tbody></table></div></section>` : "";
  const extra = (e.extra_sources || []).map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.label)}</a>`).join("");
  const dl = Hub.deadline(e, today);
  const chips = [e.kind, e.claim, e.cost].filter(Boolean).map((t) => `<span class="chip">${esc(t)}</span>`).join("") + (dl ? `<span class="chip dl ${dl.cls}" data-closes="${esc(e.closes)}">${esc(dl.text)}</span>` : "");
  const aff = e.affiliate
    ? `<a class="go alt" href="${esc(e.affiliate.url)}" target="_blank" rel="sponsored noopener noreferrer">${esc(e.affiliate.text || "Get the student offer")}</a><p class="small aff">Partner link: ${esc(config.name)} may earn a commission if you use it. That never changes what we list or how it's rated.</p>` : "";
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
    ${e.v || e.key ? `<div class="hero-value">${e.v ? `<p class="value">${e.vl ? `<span class="vl">${esc(e.vl)}</span> ` : ""}<span class="fig">${esc(e.v)}</span>${e.vu ? ` <span class="per">${esc(e.vu)}</span>` : ""}</p>` : ""}${e.key ? `<p>${esc(e.key)}</p>` : ""}</div>` : ""}
    ${listBlock("Who can get it", e.who)}
    ${numbers}
    ${listBlock("What you'll need", e.need)}
    ${steps}
    ${listBlock("Conditions and catches", e.catches, "catches")}
    ${evidenceBlock(e)}
  </article>
  <aside class="aside" aria-label="Official source">
    <h2>Official source</h2>
    <a class="go" href="${esc(e.source.url)}" target="_blank" rel="noopener noreferrer">Open the official page</a>
    ${aff}
    <button type="button" class="save-btn" data-save="${esc(e.id)}" aria-pressed="false">Save to my list</button>
    <p class="src">${esc(e.source.label)}</p>
    <dl class="meta">
      <dt>Source site</dt><dd>${esc(e.host)}</dd>
      <dt>Last checked</dt><dd>${esc(Hub.fmtDate(e.verified))}</dd>
      <dt>Next check</dt><dd data-nc="${esc(e.nextCheck)}" data-ver="${esc(e.verified)}">${esc(Hub.nextCheckText(e, today))}</dd>
      ${dl ? `<dt>Applications</dt><dd data-closes="${esc(e.closes)}">${esc(dl.text)}</dd>` : ""}
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
  writePage("entry/" + e.id + ".html", layout({
    title: entryTitle(e), description: entryDesc(e), prefix: "../", page: "entry", body, urlPath: "entry/" + e.id + ".html", current: "", cat: e.category,
    jsonld: SITE ? { "@context": "https://schema.org", "@graph": [
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: SITE + "/" },
        { "@type": "ListItem", position: 2, name: c.name, item: SITE + "/category/" + c.id + ".html" },
        { "@type": "ListItem", position: 3, name: e.name, item: SITE + "/entry/" + e.id + ".html" }] },
      { "@type": "WebPage", name: e.name, url: SITE + "/entry/" + e.id + ".html", description: e.summary, inLanguage: "en-AU", dateModified: e.verified, lastReviewed: e.verified,
        isPartOf: { "@type": "WebSite", name: config.name, url: SITE + "/" }, about: { "@type": "Thing", name: e.name, description: e.summary, url: e.source.url }, isBasedOn: e.source.url }] } : null
  }));
  pagePaths.push(["entry/" + e.id + ".html", e.verified]);
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
    <li>Company offers and fast-moving items: about every six weeks.</li>
    <li>Government payments, concessions and uni help: about every three months.</li>
    <li>Slow-moving rules and tables: about every six months, and when a new financial year or HELP year starts.</li>
  </ul>
  <p>When an entry is due, an automated check reads its official page and compares it with what we publish. If the page has changed, has gone, or can't be read, the entry is marked "Being rechecked" until a person has looked at it. Some official sites, such as Services Australia, block automated reading, so those entries are checked by hand. New entries are read and approved by a person before they go on the site.</p>
  <p>Each entry shows when it was last checked. If a scheduled check is late, the entry says "Recheck due" instead of showing a fresh-looking date.</p>
  <h2>What the labels mean</h2>
  <dl class="legend">
    <dt><span class="badge ver">Verified</span></dt><dd>Every detail shown matched the official page on the date given.</dd>
    <dt><span class="badge re">Being rechecked</span></dt><dd>Something on the source changed, or two official pages disagree. The details shown are the ones we could still confirm.</dd>
    <dt><span class="badge un">Not confirmed yet</span></dt><dd>We know it exists, but couldn't confirm the details. Use the official page.</dd>
    <dt><span class="badge yes">Likely for you</span></dt><dd>Based on your answers, you seem to meet the main conditions we track. It is not a guarantee.</dd>
    <dt><span class="badge maybe">Might apply</span></dt><dd>It depends on something you skipped, something we don't ask about, or an entry we're still rechecking.</dd>
  </dl>
  <h2>What the big number means</h2>
  <p>The highlighted figure on a card is labelled "You get" (money paid to you), "You save" (a discount) or "You pay" (a fee or price). Where there's no label, read the line beneath it.</p>
  <h2>Your answers stay with you</h2>
  <p>The questions on the home page are worked out in your browser. Your answers are kept on this device so the site remembers them between pages, and are never sent to us. Use Clear answers to remove them.</p>
  <h2>Spotted a mistake?</h2>
  <p>Rules change between our checks. ${reportHref("") ? `<a href="${reportHref("")}">Report something out of date</a> and we'll recheck that entry against the source.` : "Tell us and we'll recheck that entry against the source."} Our <a href="terms.html#corrections">corrections policy</a> says what happens next.</p>
  <h2>No one pays to be listed</h2>
  <p>Entries are chosen because students can use them. Money never changes the order of results, the verdicts or an entry's status. Any link that earns a commission is labelled, and is never used on government, university or study-support entries.</p>
  ${config.ownerName ? `<h2>Who runs this site</h2>
  <p>${esc(config.name)} is run by ${esc(config.ownerName)}${config.ownerBlurb ? ", " + esc(config.ownerBlurb) : ""}.${config.contactEmail ? ` You can reach us at <span class="sel">${esc(config.contactEmail)}</span>.` : ""}</p>` : ""}
  <h2>This is not advice</h2>
  <p>This site is general information. It is not financial, tax or legal advice, and it can't account for your full situation. Always confirm with the official source before you apply or rely on a figure.</p>
</div>
`;
writePage("about.html", layout({
  title: "How we check", description: "How every entry is sourced, rechecked and approved.", prefix: "", page: "about", body: aboutBody, urlPath: "about.html", current: "about"
}));
pagePaths.push(["about.html", latest]);

/* ---------- Terms and corrections ---------- */
const termsBody = `
<div class="page-head">
  <p class="crumbs"><a href="index.html">Home</a></p>
  <h1>Terms of use and corrections</h1>
  <p class="lede">The short version: this is a free guide to where to look, not advice, and we fix mistakes when you tell us about them.</p>
</div>
<div class="prose">
  <h2>What this site is</h2>
  <p>${esc(config.name)} lists concessions, payments, scholarships and discounts for students in Australia, and links each one to the official page it came from. It is general information only. It is not financial, tax, legal or migration advice, and it does not know your full situation.</p>
  <h2>Check before you rely on it</h2>
  <p>Amounts, rules and closing dates change, often without notice. The official page always overrides this site. Before you apply, spend money or change a plan because of something here, confirm it on the official page. We try to be accurate but can't promise every detail is current, and we are not responsible for decisions made on the strength of this site, to the extent the law allows.</p>
  <h2>"Likely for you" is a guide</h2>
  <p>The matcher compares your answers with the main conditions we track. It can't see grades, income, your course rules or anything we don't ask. Only the provider decides who is eligible.</p>
  <h2>Links to other sites</h2>
  <p>Official links go to sites we don't run. We don't control what they say or do. Links that earn a commission are always labelled and are never used on government, university or study-support entries.</p>
  <h2 id="corrections">Corrections policy</h2>
  <ul>
    <li>Tell us about a mistake or a change with ${reportHref("") ? `<a href="${reportHref("")}">the report form</a>` : "the report form"}. A link to the official page that shows the new detail is the most useful thing you can add.</li>
    <li>We aim to look at every report within a week.</li>
    <li>We check the report against the official page. If the page agrees, we correct the entry and update its checked date. If we can't confirm it, we mark the entry "Being rechecked" so readers know to take care.</li>
    <li>We don't change an entry on the strength of a report alone, and we never use a report as the source of a fact.</li>
    <li>If an entry is wrong in a way that could cost you money, say so in your report and we'll look at it first.</li>
  </ul>
  <h2>Changes</h2>
  <p>We may update these terms. The date below shows when they last changed.</p>
  <p class="small">Last updated ${esc(Hub.fmtDate(today))}.</p>
</div>
`;
writePage("terms.html", layout({
  title: "Terms of use and corrections", description: "How to use this site, and how we correct mistakes.", prefix: "", page: "terms", body: termsBody, urlPath: "terms.html", current: ""
}));
pagePaths.push(["terms.html", latest]);

/* ---------- Privacy ---------- */
const an = config.analytics || {};
const analyticsOn = !!((an.provider === "plausible" && an.domain) || ((an.provider === "cloudflare" || an.provider === "umami") && an.token));
const analyticsName = an.provider === "plausible" ? "Plausible" : an.provider === "umami" ? "Umami" : "Cloudflare Web Analytics";
const countsActions = an.provider === "plausible" || an.provider === "umami";
const privacyBody = `
<div class="page-head">
  <p class="crumbs"><a href="index.html">Home</a></p>
  <h1>Privacy</h1>
  <p class="lede">We collect as little as we can. Here is everything this site does with information about you.</p>
</div>
<div class="prose">
  <h2>Your answers to the questions</h2>
  <p>Your answers are worked out in your browser and saved on your device only, so the site remembers them between pages. They are never sent to us. Clear answers on the home page deletes them. If you use the heart to save concessions, that list is kept on your device in the same way, and Clear list on the Saved page removes it. Clearing your browser's site data removes both.</p>
  ${config.reportForm === "netlify" ? `<h2>Reports you send</h2>
  <p>If you use the report form, we receive the entry you picked, what you wrote, any link you added and, only if you give it, your email address. The form is processed by our web host, Netlify, which stores each submission in its form dashboard until we delete it. We use reports only to fix entries, and we use your email only to reply to you. Please don't put personal details, such as your Centrelink or student number, in a report.</p>
  <p>We delete a report once we've dealt with it, and in any case within 12 months. If you'd like us to delete yours sooner, send another report that says which one${config.contactEmail ? ` or email ${esc(config.contactEmail)}` : ""}, and we'll remove it.</p>` : ""}
  <h2>Visits</h2>
  ${analyticsOn ? `<p>We count visits with ${analyticsName}, which doesn't use cookies or collect personal information. It tells us which pages are read${countsActions ? ", and counts actions such as saving an entry, opening an official page or finishing the questions (never your answers)" : ""}, so we know what to check and add next.</p>` : `<p>We don't run analytics or advertising trackers.</p>`}
  <p>Our web host, Netlify, delivers the site and may keep standard server logs, such as the address a request came from, as part of running the service. Our fonts are served from this site, so loading a page doesn't contact any font service.</p>
  <h2>What we never do</h2>
  <ul><li>Sell or share information about you.</li><li>Use advertising cookies.</li><li>Ask for your Centrelink, tax or bank details.</li></ul>
  ${config.contactEmail ? `<h2>Questions</h2><p>Email <span class="sel">${esc(config.contactEmail)}</span>.</p>` : `<h2>Questions</h2><p>${reportHref("") ? `Use <a href="${reportHref("")}">the report form</a> and choose "Something not listed".` : "Contact details will be added here."}</p>`}
</div>
`;
writePage("privacy.html", layout({
  title: "Privacy", description: "What this site does with information about you.", prefix: "", page: "privacy", body: privacyBody, urlPath: "privacy.html", current: ""
}));
pagePaths.push(["privacy.html", latest]);

/* ---------- Report form (Netlify Forms) ---------- */
if (config.reportForm === "netlify") {
  const reportBody = `
<div class="page-head">
  <p class="crumbs"><a href="index.html">Home</a></p>
  <h1>Report something out of date</h1>
  <p class="lede">Tell us what's changed and we'll check it against the official source. A link to where you saw the new detail helps most.</p>
</div>
<form class="panel report-form" name="report" method="POST" action="thanks.html" data-netlify="true" netlify-honeypot="bot-field">
  <input type="hidden" name="form-name" value="report">
  <p hidden><label>Leave this empty <input name="bot-field"></label></p>
  <div class="field"><label for="r-entry">Which entry? Start typing its name, or write "something not listed".</label><input id="r-entry" name="entry" type="text" list="r-entry-list" autocomplete="off" required placeholder="For example: Youth Allowance"><datalist id="r-entry-list"></datalist></div>
  <div class="field"><label for="r-what">What's wrong or changed?</label><textarea id="r-what" name="message" rows="5" required placeholder="For example: the rate went up on 20 September, or this offer has ended."></textarea></div>
  <div class="field"><label for="r-link">Link to where you saw it (optional)</label><input id="r-link" name="link" type="url" placeholder="https://"></div>
  <div class="field"><label for="r-email">Your email, if you'd like a reply (optional)</label><input id="r-email" name="email" type="email" autocomplete="email"></div>
  <div class="panel-foot"><button class="btn" type="submit">Send report</button><p class="tally">We read every report. See <a href="privacy.html">Privacy</a> and our <a href="terms.html#corrections">corrections policy</a>.</p></div>
</form>
`;
  writePage("report.html", layout({
    title: "Report something out of date", description: "Tell us when a concession changes.", prefix: "", page: "report", body: reportBody, urlPath: "report.html", current: "", data: true, noindex: true
  }));
  writePage("thanks.html", layout({
    title: "Thanks", description: "Report received.", prefix: "", page: "thanks", urlPath: "thanks.html", current: "", noindex: true,
    body: `<div class="page-head"><h1>Thanks, we've got it</h1><p class="lede">We'll recheck that entry against the official source. <a href="index.html">Back to the home page</a></p></div>`
  }));
}

writePage("404.html", layout({
  title: "Page not found", description: config.tagline, prefix: "/", page: "404", urlPath: "404.html", current: "", noindex: true,
  body: `<div class="page-head"><h1>That page isn't here</h1><p class="lede">It may have moved or been removed. <a href="/index.html">Go to the home page</a> or search from there.</p></div>`
}));

/* ---------- Review page (preview build only) ---------- */
if (PREVIEW) {
  const flagged = all.filter((e) => e.status !== "verified" || e.draft || (e.open_questions && e.open_questions.length) || e.manual_check);
  const rows = flagged.sort((a, b) => a.name.localeCompare(b.name)).map((e) => {
    const ev = (e.evidence || []).slice(-3);
    return `<article class="review-item"><h2><a href="entry/${esc(e.id)}.html">${esc(e.name)}</a> ${Hub.statusBadge(e)}${e.draft ? ' <span class="badge draft">Draft</span>' : ""}</h2>
<p class="prov">${esc(e.provider)} · <a href="${esc(e.source.url)}" target="_blank" rel="noopener noreferrer">official page</a> · last checked ${esc(Hub.fmtDate(e.verified))}</p>
${(e.open_questions || []).length ? `<h3>Open questions</h3><ul>${e.open_questions.map((q) => `<li>${esc(typeof q === "string" ? q : JSON.stringify(q))}</li>`).join("")}</ul>` : ""}
${e.manual_check ? `<p class="notice"><b>Manual check needed.</b> ${esc(typeof e.manual_check === "string" ? e.manual_check : JSON.stringify(e.manual_check))}</p>` : ""}
<div class="side-by-side"><div><h3>What we publish</h3><p>${esc(e.key || e.summary)}</p>${(e.who || []).length ? `<ul>${e.who.slice(0, 4).map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}</div>
<div><h3>What the source said at the last check</h3>${ev.length ? ev.map((x) => `<blockquote>${esc(x.quote || x.claim || "")}</blockquote>`).join("") : "<p>No quote saved.</p>"}</div></div></article>`;
  }).join("\n");
  writePage("review.html", layout({
    title: "Review queue", description: "Entries waiting for a person to look at them.", prefix: "", page: "review", urlPath: "review.html", current: "", noindex: true,
    body: `<div class="page-head"><h1>Review queue</h1><p class="lede">${flagged.length} entries are not verified, are drafts, have open questions or need a manual check. Preview build only.</p></div><div class="review">${rows}</div>`
  }));
}

/* ---------- Robots, sitemap, headers, redirects ---------- */
if (PREVIEW) {
  fs.writeFileSync(path.join(OUT, "robots.txt"), "User-agent: *\nDisallow: /\n");
} else {
  const base = (config.siteUrl || "").replace(/\/$/, "");
  fs.writeFileSync(path.join(OUT, "robots.txt"), "User-agent: *\nAllow: /\n" + (base ? "Sitemap: " + base + "/sitemap.xml\n" : ""));
  if (base) {
    fs.writeFileSync(path.join(OUT, "sitemap.xml"), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      pagePaths.map(([u, d]) => "  <url><loc>" + esc(base + "/" + u) + "</loc>" + (d && d !== "0000-00-00" ? "<lastmod>" + d + "</lastmod>" : "") + "</url>").join("\n") + "\n</urlset>\n");
  }
  const scriptSrc = ["'self'"].concat(an.provider === "cloudflare" && an.token ? ["https://static.cloudflareinsights.com"] : [], an.provider === "plausible" ? ["https://plausible.io"] : [], an.provider === "umami" ? ["https://cloud.umami.is"] : []);
  const connectSrc = ["'self'"].concat(an.provider === "cloudflare" && an.token ? ["https://cloudflareinsights.com"] : [], an.provider === "plausible" ? ["https://plausible.io"] : [], an.provider === "umami" ? ["https://cloud.umami.is", "https://api-gateway.umami.dev"] : []);
  const csp = `default-src 'self'; script-src ${scriptSrc.join(" ")}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src ${connectSrc.join(" ")}; form-action 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'`;
  fs.writeFileSync(path.join(OUT, "_headers"), `/*
  Content-Security-Policy: ${csp}
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
  Strict-Transport-Security: max-age=31536000; includeSubDomains

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/assets/data.js
  Cache-Control: public, max-age=300, must-revalidate

/assets/*.png
  Cache-Control: public, max-age=2592000
`);
  /* The old single "uni" category was split into scholarships, campus help and TAFE. */
  fs.writeFileSync(path.join(OUT, "_redirects"), "/category/uni.html /category/scholarships.html 301\n");
}

/* ---------- Report ---------- */
const overdue = all.filter((e) => e.nextCheck < today);
console.log(`${PREVIEW ? "Preview" : "Public"} build: ${entries.length} entries in ${usedCats.length} categories, ${instPages.length} university pages, ${statePages.length} state pages, ${situations.length} situation pages -> ${path.relative(ROOT, OUT)}/`);
if (!PREVIEW && drafts.length) console.log(`  ${drafts.length} draft entries left out (run with --preview to see them): ${drafts.map((e) => e.id).join(", ")}`);
if (!PREVIEW) {
  const todo = [];
  if (!config.siteUrl) todo.push("set siteUrl in site.config.json (turns on canonical links and the sitemap)");
  if (!config.ownerName) todo.push("set ownerName so the About page says who runs the site");
  if (!config.contactEmail) todo.push("set contactEmail for the footer and privacy page");
  if (!analyticsOn) todo.push("optional: set analytics (plausible domain, umami or cloudflare token)");
  if (todo.length) console.log("  Before launch: " + todo.join("; "));
}
if (overdue.length) console.log(`  Overdue for a recheck: ${overdue.length} entries${overdue.length <= 12 ? " (" + overdue.map((e) => e.id + " due " + e.nextCheck).join(", ") + ")" : ""}`);
