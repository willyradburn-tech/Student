#!/usr/bin/env node
/* Applies the results of a scheduled recheck run to data/entries.

   node scripts/recheck.js results.json [--write] [--date YYYY-MM-DD]

   results.json is a compact array, one item per entry checked:
     { "id": "...", "result": "confirmed" | "changed" | "closed" | "gone",
       "quote": "exact text from the official page", "note": "what differs (changed/gone)",
       "closes": "YYYY-MM-DD" (optional, a closing date the page states) }

   What each result does (entries always stay live, so nothing vanishes from the site):
   - confirmed: verified date set to today, status "verified", quote added as evidence.
   - changed:   status "rechecking" (the site then shows it as "Might apply" at most),
                the note and quote go into open_questions for a person to review.
   - closed:    closes set to "closed" and the verified date refreshed.
   - gone:      status "rechecking", note recorded. The page moved or no longer exists.
   Every run is logged in research/recheck-log.md. */
"use strict";
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const file = args[0];
const WRITE = args.includes("--write");
const di = args.indexOf("--date");
const today = di >= 0 ? args[di + 1] : new Date().toISOString().slice(0, 10);
if (!file) { console.error("Usage: node scripts/recheck.js results.json [--write]"); process.exit(1); }

const root = path.join(__dirname, "..");
const dir = path.join(root, "data", "entries");
let text = fs.readFileSync(file, "utf8");
const fence = text.match(/```json\s*([\s\S]*?)```/);
if (fence) text = fence[1];
const results = JSON.parse(text);
const OK = ["confirmed", "changed", "closed", "gone"];
const counts = { confirmed: 0, changed: 0, closed: 0, gone: 0 };
const flagged = [];

for (const r of results) {
  const p = path.join(dir, r.id + ".json");
  if (!fs.existsSync(p)) { console.error("Unknown id, skipped: " + r.id); continue; }
  if (!OK.includes(r.result)) { console.error("Unknown result for " + r.id + ": " + r.result); continue; }
  const e = JSON.parse(fs.readFileSync(p, "utf8"));
  counts[r.result]++;
  const ev = { claim: "Recheck " + today, quote: r.quote || "", url: e.source.url, page_date: null };
  if (r.result === "confirmed") {
    e.verified = today; e.status = "verified";
    if (r.quote) e.evidence = (e.evidence || []).concat(ev).slice(-6);
    if (r.closes && /^\d{4}-\d{2}-\d{2}$/.test(r.closes)) e.closes = r.closes;
  } else if (r.result === "closed") {
    e.verified = today; e.closes = "closed";
    if (r.quote) e.evidence = (e.evidence || []).concat(ev).slice(-6);
  } else {
    e.status = "rechecking";
    e.open_questions = (e.open_questions || []).concat(today + " " + r.result + ": " + (r.note || "") + (r.quote ? ' Page says: "' + r.quote + '"' : "")).slice(-5);
    flagged.push("- " + e.id + " (" + r.result + "): " + (r.note || "") + " " + e.source.url);
  }
  console.log(r.result.padEnd(10) + r.id);
  if (WRITE) fs.writeFileSync(p, JSON.stringify(e, null, 2) + "\n");
}

const summary = `\n## ${today}\n${results.length} checked: ${counts.confirmed} confirmed, ${counts.closed} closed, ${counts.changed} changed, ${counts.gone} gone.\n` + (flagged.length ? "Needs a person:\n" + flagged.join("\n") + "\n" : "");
console.log(summary);
if (WRITE) fs.appendFileSync(path.join(root, "research", "recheck-log.md"), summary);
else console.log("Dry run. Add --write to save.");
