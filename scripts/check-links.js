#!/usr/bin/env node
/* Checks that every entry's official source page still loads, and that the live site is up.
   It does NOT read the pages or change any entry. That is the recheck's job.

   node scripts/check-links.js                  all approved entries
   node scripts/check-links.js --site URL       also check the live site responds
   node scripts/check-links.js --limit 50       only the first 50 (for a quick test)

   Exits non-zero if the site is down or more than 10% of sources fail, so a scheduled
   run shows up as a failed workflow. Some sites block bots (403/429); those count as
   "blocked", not broken, and are listed separately. */
"use strict";
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const limit = Number(val("--limit")) || Infinity;
const site = val("--site");

const dir = path.join(__dirname, "..", "data", "entries");
const entries = fs.readdirSync(dir).filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")))
  .filter((e) => e.review === "approved").slice(0, limit);

async function probe(url) {
  for (const method of ["HEAD", "GET"]) {
    try {
      const r = await fetch(url, { method, redirect: "follow", signal: AbortSignal.timeout(20000),
        headers: { "user-agent": "StudentStack link check (+https://studentstack.com.au/about.html)" } });
      if (r.ok) return { ok: true, status: r.status };
      if (method === "GET" || ![403, 405, 501].includes(r.status)) return { ok: false, status: r.status };
    } catch (err) {
      if (method === "GET") return { ok: false, status: String(err.cause && err.cause.code || err.name) };
    }
  }
}

(async () => {
  let down = false;
  if (site) {
    const r = await probe(site);
    console.log(`Site ${site}: ${r.ok ? "up" : "DOWN (" + r.status + ")"}`);
    down = !r.ok;
  }
  const jobs = entries.map((e) => ({ id: e.id, url: e.source.url }));
  const results = [];
  let next = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (next < jobs.length) {
      const j = jobs[next++];
      results.push(Object.assign(j, await probe(j.url)));
    }
  }));
  const blocked = results.filter((r) => !r.ok && [401, 403, 429].includes(r.status));
  const broken = results.filter((r) => !r.ok && !blocked.includes(r));
  console.log(`${results.length} sources: ${results.length - broken.length - blocked.length} ok, ${blocked.length} blocked, ${broken.length} broken`);
  broken.forEach((r) => console.log(`BROKEN ${r.status}  ${r.id}  ${r.url}`));
  blocked.forEach((r) => console.log(`blocked ${r.status}  ${r.id}`));
  if (down || broken.length > results.length * 0.1) process.exit(1);
})();
