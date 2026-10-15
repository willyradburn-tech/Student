#!/usr/bin/env node
/* Sets each entry's "closes" from deadlines the entry already states in its own
   text (how, need, who, catches, numbers). Those sentences came from the official
   page, so this doesn't add any new claim; it only turns a stated date into a field.

     node scripts/extract-closes.js            dry run: shows what would be set
     node scripts/extract-closes.js --write    saves it

   Rules: the earliest future "close(s)" date wins. If the text says a round has
   closed and gives no future date, "closes" is set to "closed". Entries with no
   stated deadline are left alone. Entries that already have "closes" are skipped
   unless you pass --force. */
"use strict";
const fs = require("fs");
const path = require("path");
const dir = path.join(__dirname, "..", "data", "entries");
const write = process.argv.includes("--write"), force = process.argv.includes("--force");
const today = (process.argv.find((a) => a.startsWith("--date=")) || "").slice(7) || new Date().toISOString().slice(0, 10);
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const FULL = { january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };

function monthNum(w) { w = w.toLowerCase(); return MONTHS[w.slice(0, 4)] && w.length <= 4 ? MONTHS[w] || MONTHS[w.slice(0, 3)] : FULL[w] || MONTHS[w.slice(0, 3)]; }
function iso(y, m, d) { return y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0"); }

/* Every date in a sentence: "16 October 2026", "16 Oct", "16/10/2026", "16-10-2026". */
function datesIn(sentence) {
  const out = [];
  const a = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?(?:\s+(\d{4}))?/gi;
  let m;
  while ((m = a.exec(sentence))) out.push({ d: +m[1], m: monthNum(m[2]), y: m[3] ? +m[3] : null, at: m.index });
  const b = /\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})\b/g;
  while ((m = b.exec(sentence))) out.push({ d: +m[1], m: +m[2], y: +m[3], at: m.index });
  return out;
}

function resolve(dt, base) {
  let y = dt.y;
  if (!y) {
    y = +base.slice(0, 4);
    if (iso(y, dt.m, dt.d) < base) y += 1;   /* "closes 15 March" with no year: the next 15 March */
    dt.guessedYear = true;
  }
  return iso(y, dt.m, dt.d);
}

let set = 0, closed = 0, skipped = 0;
const KEY = /\bclos(e|es|ing|ed)\b|\bdeadline\b|\bdue (by|on)\b/i;
const showWhy = process.argv.includes("--why");
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
  const p = path.join(dir, f), e = JSON.parse(fs.readFileSync(p, "utf8"));
  if (e.closes && !force) { skipped++; continue; }
  const texts = [].concat(e.how || [], e.need || [], e.who || [], e.catches || [], (e.numbers || []).map((r) => r[0] + ": " + r[1]));
  const future = [], past = [], why = [];
  let sawClosed = false;
  for (const t of texts) {
    for (const s of t.split(/(?<=[.;])\s+/)) {
      const k = KEY.exec(s);
      if (!k) continue;
      const isPast = /\bclosed\b/i.test(s);
      if (isPast) sawClosed = true;
      /* Only dates written after the word "close(s)" or "deadline" belong to it,
         so an opening date earlier in the sentence is never taken as a deadline. */
      for (const dt of datesIn(s)) {
        if (dt.at < k.index) continue;
        const r = resolve(dt, today);
        if (isPast && !/\bclos(e|es|ing)\b/i.test(s)) { past.push(r); continue; }
        (r >= today ? future : past).push(r);
        why.push(r + " <- " + s.slice(0, 140));
      }
    }
  }
  future.sort();
  let value = null;
  if (future.length) value = future[0];
  else if (sawClosed || past.length) value = "closed";
  if (!value) continue;
  if (value === "closed") closed++; else set++;
  console.log((write ? "set " : "would set ") + f.replace(".json", "") + " closes=" + value + (showWhy && value !== "closed" ? "\n      " + why.find((w) => w.startsWith(value)) : ""));
  if (write) { e.closes = value; fs.writeFileSync(p, JSON.stringify(e, null, 2) + "\n"); }
}
console.log("\n" + set + " with a future deadline, " + closed + " marked closed, " + skipped + " already had a value." + (write ? "" : " Dry run: add --write to save."));
