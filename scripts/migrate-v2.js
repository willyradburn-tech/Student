#!/usr/bin/env node
/* One-off migration for the November 2026 review (kept for the record).
   node scripts/migrate-v2.js          dry run, prints what would change
   node scripts/migrate-v2.js --write  writes the entry files and categories.json

   - institution: which university an entry is about, stored instead of guessed
   - states: SA, Tasmania and NT are separate; "other" is gone from state rules
   - residency rules on government entries that had none
   - TAFE vs apprentice rules
   - new categories (scholarships, campus help, TAFE, bills)
   - rules for the new questions (level, year, hcc, regional, disability, parent, gender) */
"use strict";
const fs = require("fs");
const path = require("path");
const Hub = require("../src/assets/shared.js");
const WRITE = process.argv.includes("--write");
const root = path.join(__dirname, "..");
const dir = path.join(root, "data/entries");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
const entries = files.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
const log = {};
const note = (k, id) => { (log[k] = log[k] || []).push(id); };

/* ---- 1. Institution from the source address or the provider's name ---- */
const HOSTS = {
  "rmit.edu.au": "rmit", "monash.edu": "monash", "mga.monash.edu": "monash", "sydney.edu.au": "sydney", "srcusyd.net.au": "sydney", "seymourcentre.com": "sydney",
  "scholarships.unsw.edu.au": "unsw", "unsw.edu.au": "unsw", "arc.unsw.edu.au": "unsw", "westernsydney.edu.au": "wsu",
  "adelaide.edu.au": "adelaide", "adelaideuni.edu.au": "adelaide", "ausaadelaide.com.au": "adelaide", "csu.edu.au": "csu",
  "newcastle.edu.au": "newcastle", "uts.edu.au": "uts", "uwastudentguild.com": "uwa", "uwa.edu.au": "uwa", "anu.edu.au": "anu", "study.anu.edu.au": "anu", "anusa.com.au": "anu",
  "deakin.edu.au": "deakin", "scholarships.unimelb.edu.au": "unimelb", "students.unimelb.edu.au": "unimelb", "umsu.unimelb.edu.au": "unimelb",
  "unisq.edu.au": "unisq", "latrobesu.org.au": "latrobe", "students.mq.edu.au": "mq", "mq.edu.au": "mq", "cqu.edu.au": "cqu",
  "flinders.edu.au": "flinders", "students.flinders.edu.au": "flinders", "oasis.flinders.edu.au": "flinders", "fusa.edu.au": "flinders",
  "jcu.edu.au": "jcu", "une.edu.au": "une", "unelife.com.au": "une", "acu.edu.au": "acu", "curtin.edu.au": "curtin", "guild.curtin.edu.au": "curtin", "scholarships.curtin.edu.au": "curtin",
  "swinburne.edu.au": "swinburne", "bond.edu.au": "bond", "cdu.edu.au": "cdu", "ecu.edu.au": "ecu", "murdoch.edu.au": "murdoch", "notredame.edu.au": "notredame",
  "unisc.edu.au": "usc", "uow.edu.au": "uow", "utas.shorthandstories.com": "utas", "vu.edu.au": "vu", "utas.edu.au": "utas", "unisa.edu.au": "unisa",
  "qut.edu.au": "qut", "uq.edu.au": "uq", "griffith.edu.au": "griffith", "scu.edu.au": "scu"
};
function hostOf(e) { return new URL(e.source.url).hostname.replace(/^www\./, ""); }
function instOf(e) {
  const m = e.match && e.match.uni;
  if (m && m.yes && m.yes.length === 1 && !["other", "tafe"].includes(m.yes[0])) return m.yes[0];
  if (e.institution) return e.institution;
  if (m && (m.yes || []).includes("other")) {
    if (HOSTS[hostOf(e)]) return HOSTS[hostOf(e)];
    const t = e.provider + " " + e.name;
    for (const [id, name] of Object.entries(Hub.INST_NAME)) if (t.toLowerCase().includes(name.toLowerCase())) return id;
  }
  return null;
}

/* ---- 2. State splits ---- */
function splitOther(e) {
  const t = (e.id + " " + e.provider + " " + e.name + " " + hostOf(e)).toLowerCase();
  if (/\bsa\b|^sa-|adelaide|tafe-sa|south australia|flinders/.test(t) || e.id.startsWith("sa-") || e.id.startsWith("tafe-sa")) return ["sa"];
  if (/tas|tasmania|metro-tas/.test(e.id) || /tasmania|tastafe/.test(t)) return ["tas"];
  if (/^nt-|cdu|northern territory|darwin|batchelor/.test(e.id + " " + t)) return ["nt"];
  return ["sa", "tas", "nt"];
}
function migrateStates(e) {
  const m = e.match || {};
  ["state", "campus"].forEach((k) => {
    const c = m[k]; if (!c) return;
    ["yes", "maybe", "no"].forEach((arm) => {
      if (!c[arm] || !c[arm].includes("other")) return;
      const rep = splitOther(e);
      c[arm] = Array.from(new Set(c[arm].filter((v) => v !== "other").concat(rep)));
      note("state split", e.id + " -> " + rep.join("/"));
    });
  });
}

/* ---- 3. Categories ---- */
const isTafe = (e) => (e.match && e.match.uni && (e.match.uni.yes || []).includes("tafe")) || (e.tags || []).includes("apprentice") || (e.tags || []).includes("trainee");
const BILLS = /(utilit|energy|electricity|water and sewer|water & sewer|\bwater\b.*concession|sewerage|gas concession|winter gas|emergency services levy|heating|cooling|cost of living|registration|licence|motor tax|ctp)/i;
function newCategory(e) {
  if (isTafe(e) || /fee-free tafe|free tafe|vet student loan/i.test(e.name + e.summary) && (e.tags || []).includes("tafe")) return "tafe";
  if (e.category === "uni") {
    const n = e.name.toLowerCase(), t = (e.name + " " + e.summary + " " + (e.tags || []).join(" ")).toLowerCase();
    if (/scholarship|bursar|award|prize|fellowship|exhibition|studentship|cadetship|bonus/.test(n)) return "scholarships";
    if (/hardship|emergency|loan|food|pantry|meal|counsel|legal|disab|accessib|wellbeing|well-being|health|clinic|support|service|advice|housing|accommodation help|childcare|chaplain|welfare|library|grocer|laptop loan|textbook|study assist|career|jobs|mentor|concession|rebate|discount|free|gym|sport/.test(n)) return "campus";
    if (/scholarship|bursar/.test(t)) return "scholarships";
    return "campus";
  }
  if ((e.category === "health" || e.category === "transport") && BILLS.test(e.name) && !/ambulance|dental|spectacle|medical aid|travel|patient/i.test(e.name)) return "bills";
  if (/national parks|port arthur|overland track/i.test(e.name)) return "streaming";
  if (/^(fitness-first|goodlife)/.test(e.id)) return "health";
  return e.category;
}

/* ---- 4. Residency rules for government entries that had none ---- */
const GOV_CATS = new Set(["payments", "loans", "health", "transport", "bills"]);

/* ---- 5. Rules for the new questions, from each entry's own name and summary ---- */
const has = (t, re) => re.test(t);
function newRules(e) {
  const out = {}, head = e.name + ". " + e.summary, m = e.match || {};
  const low = head.toLowerCase();
  if (!m.level) {
    const pgOnly = /\b(postgraduate|post-graduate|masters|master's|phd|doctoral|higher degree by research|hdr)\b/.test(low) && !/undergrad|bachelor|diploma/.test(low) && !/\bnot\b[^.]{0,40}(postgrad|masters|phd)/.test(low);
    const hdrOnly = (/(research training|phd|hdr|doctoral|higher degree)/.test(e.name.toLowerCase()) || /\bcandidates\b/.test(low)) && !/undergrad|bachelor|coursework/.test(low);
    const ugOnly = /\b(undergraduate|bachelor|bachelor's)\b/.test(low) && !/postgrad|post-graduate|masters|phd/.test(low);
    if (hdrOnly) out.level = { yes: ["hdr"], maybe: ["pg"] };
    else if (pgOnly) out.level = { yes: ["pg", "hdr"] };
    else if (ugOnly) out.level = { yes: ["ug"] };
  }
  if (!m.year && /\b(first[- ]year|commencing|first[- ]in[- ]family|entering|new students?)\b/.test(low) && !/not .{0,20}first/.test(low)) out.year = { yes: ["first"], maybe: ["cont"] };
  if (!m.hcc && /health care card|concession card|pensioner/.test(low) && !/low income health care card$/.test(e.name.toLowerCase())) out.hcc = { yes: ["yes"], maybe: ["no"] };
  if (!m.regional && /\b(regional|rural|remote|country)\b/.test(low) && !/\bregional (campus|university)\b/.test(low)) out.regional = { yes: ["yes"], maybe: ["no"] };
  if (!m.disability && /\b(disability|disabilities|accessability|accessibility|long-term (health )?condition)\b/.test(low)) out.disability = { yes: ["yes"], maybe: ["no"] };
  if (!m.parent && /\b(parent|parents|carer|carers|caring|single mother|childcare|child care)\b/.test(low)) out.parent = { yes: ["yes"], maybe: ["no"] };
  if (!m.gender && /\b(women|woman|female|girls)\b/.test(low) && !/\b(men and women|women and men|all genders|any gender|regardless of gender|including (women|female))\b/.test(low)) out.gender = { yes: ["woman"], maybe: ["nb"] };
  return out;
}

/* ---- Run ---- */
const OPEN_FIXES = {
  "education-entry-payment": { res: { yes: ["citizen", "pr"], maybe: ["intl"] } },
  "dewr-skills-for-education-and-employment": { res: { yes: ["citizen", "pr"], maybe: ["intl"] } },
  "utas-tax-clinic": { uni: { yes: ["utas"] } }
};
const WHOLE_SITE = new Set(["self-education-deductions", "dewr-your-career", "reading-writing-hotline"]);

entries.forEach((e) => {
  e.match = e.match || {};
  migrateStates(e);
  const inst = instOf(e);
  if (inst) {
    e.institution = inst;
    e.match.uni = { yes: [inst] };
    note("institution", e.id + " -> " + inst);
  } else if (e.match.uni && (e.match.uni.yes || []).includes("other")) note("uni other left", e.id);
  const dual = (e.tags || []).includes("tafe") && inst && !isTafe(e);
  if (dual) {
    e.match.uni = { yes: [inst, "tafe"] };
    note("dual sector", e.id);
    if (/tafe|vet\b|fee-free/i.test(e.name + " " + e.provider)) { e.category = e.category === "uni" ? "tafe" : e.category; }
  }
  if (!dual && isTafe(e)) {
    const apprentice = (e.tags || []).includes("apprentice") || (e.tags || []).includes("trainee");
    const tafeTagged = (e.tags || []).includes("tafe") || /tafe/i.test(e.name + e.provider);
    if (apprentice && !tafeTagged) e.match.uni = { yes: ["apprentice"], maybe: ["tafe"] };
    else if (apprentice) e.match.uni = { yes: ["apprentice", "tafe"] };
    else e.match.uni = { yes: ["tafe"], maybe: ["apprentice"] };
    note("tafe split", e.id + " -> " + JSON.stringify(e.match.uni));
  }
  Object.assign(e.match, OPEN_FIXES[e.id] || {});
  const cat = newCategory(e);
  if (cat !== e.category) { note("category " + e.category + " -> " + cat, e.id); e.category = cat; }
  if (GOV_CATS.has(e.category) && !e.match.res && !/international student|overseas student/i.test(e.name + e.summary) && !WHOLE_SITE.has(e.id) && Hub.derive(e, hostOf(e)).kind === "Government") {
    e.match.res = { yes: ["citizen", "pr"], maybe: ["intl"] };
    note("residency added", e.id);
  }
  const nr = newRules(e);
  Object.keys(nr).forEach((k) => { e.match[k] = nr[k]; note("rule " + k, e.id); });
  /* Store the states an entry covers instead of guessing from wording every build. */
  const st = Hub.derive(e, hostOf(e)).st;
  if (st.length) e.states = st; else delete e.states;
  if (!Object.keys(e.match).length) { e.openToAll = true; delete e.match; note("open to all", e.id); }
});

Object.keys(log).sort().forEach((k) => console.log(k.padEnd(34), log[k].length));
if (process.argv.includes("--detail")) Object.keys(log).sort().forEach((k) => { console.log("\n== " + k); log[k].forEach((x) => console.log("  " + x)); });

if (WRITE) {
  entries.forEach((e, i) => fs.writeFileSync(path.join(dir, files[i]), JSON.stringify(e, null, 2) + "\n"));
  const cats = JSON.parse(fs.readFileSync(path.join(root, "data/categories.json"), "utf8"));
  const byId = Object.fromEntries(cats.map((c) => [c.id, c]));
  byId.health.name = "Health, fitness and concession cards"; byId.health.short = "Health";
  byId.health.note = "Concession cards, free and cheaper health services, gyms and the rebates a Health Care Card unlocks.";
  const add = [
    { id: "scholarships", name: "Scholarships and bursaries", short: "Scholarships", note: "Scholarships, bursaries, awards and prizes from universities, TAFEs, foundations and student unions." },
    { id: "campus", name: "Hardship, loans and campus services", short: "Campus help", note: "Emergency grants, short-term loans, food pantries, counselling, legal advice and other free services from your uni and student union." },
    { id: "tafe", name: "TAFE and apprenticeships", short: "TAFE", note: "Fee-free TAFE, apprentice payments and travel help, tool allowances and TAFE scholarships and support." },
    { id: "bills", name: "Bills and living costs", short: "Bills", note: "Energy, water and gas concessions and vehicle registration discounts, mostly with a concession card." }
  ];
  const order = ["payments", "loans", "tax", "tafe", "scholarships", "campus", "transport", "bills", "health", "software", "tech", "streaming", "career"];
  const all = Object.values(byId).filter((c) => c.id !== "uni").concat(add);
  const outCats = order.map((id) => all.find((c) => c.id === id));
  fs.writeFileSync(path.join(root, "data/categories.json"), JSON.stringify(outCats, null, 2) + "\n");
  console.log("written");
}
if (process.argv.includes("--rules")) {
  const want = process.argv[process.argv.indexOf("--rules") + 1];
  entries.forEach((e) => { if (e.match && e.match[want]) console.log(JSON.stringify(e.match[want]).padEnd(34), e.id.padEnd(52), "|", e.summary.slice(0, 110)); });
}
