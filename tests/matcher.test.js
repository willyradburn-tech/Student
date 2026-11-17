"use strict";
/* The five test students from the November 2026 review, plus checks on search. Run: npm test */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const Hub = require("../src/assets/shared.js");

const dir = path.join(__dirname, "..", "data/entries");
const entries = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => {
  const e = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  return Object.assign(e, Hub.derive(e, new URL(e.source.url).hostname), { nc: "2999-01-01" });
}).filter((e) => e.review === "approved");
const byId = Object.fromEntries(entries.map((e) => [e.id, e]));
const profile = (o) => Object.assign(Hub.blankProfile(), o);
const verdict = (id, p) => Hub.evaluate(byId[id], p);
const likely = (p) => entries.filter((e) => Hub.evaluate(e, p) === "yes");
const index = Hub.buildIndex(entries);
const top = (q, n) => (Hub.search(index, q) || []).slice(0, n || 3).map((r) => r.e.id);

test("a QUT student is not shown other universities' awards as likely", () => {
  const p = profile({ state: "qld", campus: "qld", uni: "qut", res: "citizen" });
  const bad = likely(p).filter((e) => e.institution && e.institution !== "qut");
  assert.deepStrictEqual(bad.map((e) => e.id), []);
});

test("a Monash student sees Monash entries, not Curtin or Deakin ones", () => {
  const p = profile({ state: "vic", campus: "vic", uni: "monash", res: "citizen" });
  const l = likely(p);
  assert.ok(l.some((e) => e.institution === "monash"), "Monash entries should appear");
  assert.deepStrictEqual(l.filter((e) => e.institution && e.institution !== "monash").map((e) => e.id), []);
});

test("a Tasmanian student is not shown SA or NT concessions", () => {
  const p = profile({ state: "tas", campus: "tas", uni: "utas", res: "citizen" });
  assert.notStrictEqual(verdict("adelaide-metro-tertiary-concession", p), "yes");
  assert.strictEqual(verdict("sa-water-sewerage-concession", p), "no");
  assert.strictEqual(verdict("nt-free-public-buses", p), "no");
});

test("a NSW apprentice is not shown TAFE Queensland entries", () => {
  const p = profile({ state: "nsw", campus: "nsw", uni: "apprentice", res: "citizen" });
  assert.strictEqual(verdict("tafe-qld-payment-plan", p), "no");
  assert.strictEqual(verdict("tafe-qld-free-counselling", p), "no");
});

test("an international student is not told government payments are likely", () => {
  const p = profile({ state: "qld", campus: "qld", uni: "uq", res: "intl" });
  for (const id of ["qld-bond-loan", "qld-patient-travel-subsidy-scheme", "services-australia-low-income-health-care-card"]) {
    if (byId[id]) assert.notStrictEqual(verdict(id, p), "yes", id);
  }
});

test("HECS-HELP is not likely for a TAFE student", () => {
  assert.strictEqual(verdict("hecs-help", profile({ uni: "tafe", res: "citizen" })), "no");
});

test("a postgraduate is ruled out of undergraduate-only awards, and a man out of women-only ones", () => {
  const ug = entries.find((e) => e.match && e.match.level && JSON.stringify(e.match.level) === '{"yes":["ug"]}');
  assert.strictEqual(Hub.evaluate(ug, profile({ level: "pg" })), "no");
  const w = byId["uq-hatch-women-engineering-scholarship"];
  assert.strictEqual(Hub.evaluate(w, profile({ gender: "man" })), "no");
});

test("blank answers never rule anything out", () => {
  assert.strictEqual(likely(profile({})).length >= 0, true);
  assert.ok(entries.every((e) => Hub.evaluate(e, profile({})) !== "no"));
});

test("search puts the obvious entry first", () => {
  assert.strictEqual(top("rent", 1)[0], "rent-assistance");
  assert.strictEqual(top("hecs", 1)[0], "hecs-help");
  assert.ok(top("opal", 3).includes("nsw-tertiary-opal"));
  assert.ok(top("centrelink", 3).includes("youth-allowance"));
});

test("search does not return half the site for common words", () => {
  for (const q of ["hecs", "help debt", "go card", "hardship"]) assert.ok((Hub.search(index, q) || []).length < 200, q);
});

test("search finds common words that used to return nothing", () => {
  for (const q of ["power bill", "medicare", "chatgpt"]) assert.ok((Hub.search(index, q) || []).length > 0, q);
});

test("closing dates and overdue checks are worked out from today's date", () => {
  assert.strictEqual(Hub.deadline({ closes: "2026-11-20" }, "2026-11-17").cls, "soon");
  assert.strictEqual(Hub.deadline({ closes: "2026-11-01" }, "2026-11-17").text, "Round closed");
  assert.strictEqual(Hub.isOverdue({ nc: "2026-11-01" }, "2026-11-17"), true);
  assert.strictEqual(Hub.isOverdue({ nc: "2026-12-01" }, "2026-11-17"), false);
});
