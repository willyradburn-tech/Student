#!/usr/bin/env node
/* Brings a research agent's output into data/entries, so the entry files stay
   the single source of truth.

   node scripts/merge.js agent-output.json            show what would change (nothing is written)
   node scripts/merge.js agent-output.json --write    write the changes

   The input is the JSON array the research prompt returns (DISCOVER or VERIFY mode).
   A fenced ```json block pasted straight from the agent also works.

   Safety rules:
   - Every entry is checked against the schema first. Any problem stops the whole merge.
   - New entries are always written as "review": "pending".
   - An existing entry goes back to "pending" when its figures, eligibility or matching
     rules change, so a person approves those before they go live. Wording-only changes
     and fresh verified dates keep the entry's approval.
   - Evidence and open questions are kept in the file as an audit trail. */
"use strict";
const fs = require("fs");
const path = require("path");
const { validateEntry } = require("../src/validate.js");

const [file, ...rest] = process.argv.slice(2);
const WRITE = rest.includes("--write");
if (!file) { console.error("Usage: node scripts/merge.js agent-output.json [--write]"); process.exit(1); }

const root = path.join(__dirname, "..");
const dir = path.join(root, "data", "entries");
const cats = new Set(JSON.parse(fs.readFileSync(path.join(root, "data", "categories.json"), "utf8")).map((c) => c.id));

let text = fs.readFileSync(file, "utf8");
const fence = text.match(/```json\s*([\s\S]*?)```/);
if (fence) text = fence[1];
let incoming;
try { incoming = JSON.parse(text); } catch (err) { console.error("Couldn't read the JSON: " + err.message); process.exit(1); }
if (!Array.isArray(incoming)) incoming = [incoming];

const SENSITIVE = ["key", "numbers", "who", "match", "cap", "status"];
const same = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);

const problems = [];
const plan = incoming.map((e) => {
  delete e.changes;
  problems.push(...validateEntry(e, cats, e.id || "(entry with no id)"));
  const p = path.join(dir, (e.id || "unknown") + ".json");
  const old = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
  if (!old) { e.review = "pending"; return { e, p, kind: "new", fields: [] }; }
  const fields = Object.keys(Object.assign({}, old, e)).filter((k) => !same(old[k], e[k]) && k !== "review");
  const sensitive = fields.filter((k) => SENSITIVE.includes(k));
  e.review = sensitive.length ? "pending" : old.review;
  return { e, p, kind: fields.length ? "changed" : "unchanged", fields, sensitive };
});

if (problems.length) {
  console.error("Nothing merged. Fix these in the agent output first:\n  " + problems.join("\n  "));
  process.exit(1);
}

plan.forEach(({ e, kind, fields, sensitive }) => {
  if (kind === "new") console.log(`NEW        ${e.id}  (${e.status}, pending review)`);
  else if (kind === "changed") console.log(`CHANGED    ${e.id}  ${fields.join(", ")}${sensitive.length ? "  -> back to pending review" : ""}`);
  else console.log(`UNCHANGED  ${e.id}`);
});

if (!WRITE) { console.log("\nDry run. Add --write to save these changes."); process.exit(0); }
plan.filter((x) => x.kind !== "unchanged").forEach(({ e, p }) => fs.writeFileSync(p, JSON.stringify(e, null, 2) + "\n"));
console.log("\nWritten. Run `node build.js --preview` to review, then approve entries by setting \"review\": \"approved\".");
