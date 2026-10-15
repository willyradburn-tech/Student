#!/usr/bin/env node
/* Lists entries due for a recheck, straight from data/entries.

   node scripts/due.js                 a readable list
   node scripts/due.js --json          the due entries as a JSON array, ready to paste
                                       into the research prompt in VERIFY mode
   node scripts/due.js --sheet         CSV rows for the Gemini sheet's Requests tab:
                                       Request ID, Entry ID, Claim, Source URL, Requested on
   node scripts/due.js --all ...       every entry, not just the due ones
   node scripts/due.js --date 2026-11-01 ...   check against another date */
"use strict";
const fs = require("fs");
const path = require("path");
const { CADENCE_DAYS } = require("../src/validate.js");

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const dateArg = args.indexOf("--date");
const today = dateArg >= 0 ? args[dateArg + 1] : new Date().toISOString().slice(0, 10);
// --ids a,b,c adds specific entries, for example ones just corrected, to the due list.
const idsArg = args.indexOf("--ids");
const extraIds = idsArg >= 0 ? args[idsArg + 1].split(",") : [];

const dir = path.join(__dirname, "..", "data", "entries");
const entries = fs.readdirSync(dir).filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));

function nextCheck(e) {
  const d = new Date(e.verified + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + (CADENCE_DAYS[e.cadence] || 30));
  return d.toISOString().slice(0, 10);
}

const due = entries
  .map((e) => Object.assign({}, e, { nextCheck: nextCheck(e) }))
  .filter((e) => flag("--all") || e.nextCheck <= today || e.status !== "verified" || extraIds.includes(e.id))
  .sort((a, b) => a.nextCheck.localeCompare(b.nextCheck));
// --limit N keeps a scheduled run small: only the N most overdue entries.
const limitArg = args.indexOf("--limit");
if (limitArg >= 0) due.splice(parseInt(args[limitArg + 1], 10) || due.length);

if (flag("--brief")) {
  // Just what a recheck needs, to keep the scheduled run cheap.
  const brief = due.map((e) => ({ id: e.id, name: e.name, key: e.key || "", who: (e.who || []).slice(0, 2), closes: e.closes || "", url: e.source.url }));
  process.stdout.write(JSON.stringify(brief) + "\n");
} else if (flag("--json")) {
  // Strip working fields so the agent sees only what the site publishes.
  const clean = due.map(({ nextCheck, evidence, open_questions, changes, ...rest }) => rest);
  process.stdout.write(JSON.stringify(clean, null, 2) + "\n");
} else if (flag("--sheet")) {
  // One row per checkable claim. Gemini sees the claim and the source, never our verdict.
  const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
  const rows = [];
  due.forEach((e) => {
    const claims = [];
    if (e.key) claims.push(e.key);
    (e.numbers || []).forEach((r) => claims.push(r[0] + ": " + r[1]));
    (e.who || []).forEach((w) => claims.push("Who can get it: " + w));
    // Entries we couldn't confirm have few claims; ask Gemini to check the summary and state the details.
    if (!claims.length || e.status === "unverified") claims.push(e.summary + " State the current amount and who can get it.");
    claims.forEach((c, i) => rows.push([e.id + "-" + today + "-" + (i + 1), e.id, e.name + ". " + c, e.source.url, today].map(q).join(",")));
  });
  process.stdout.write(rows.join("\n") + "\n");
} else {
  if (!due.length) { console.log("Nothing due on " + today + "."); process.exit(0); }
  console.log(due.length + " entries to recheck as of " + today + ":");
  due.forEach((e) => console.log("  " + e.nextCheck + "  " + e.status.padEnd(10) + "  " + e.id));
}
