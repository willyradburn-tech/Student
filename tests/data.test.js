"use strict";
/* Every entry file is valid, and the site builds from them. Run: npm test */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { validateEntry } = require("../src/validate.js");

const root = path.join(__dirname, "..");
const cats = new Set(JSON.parse(fs.readFileSync(path.join(root, "data/categories.json"), "utf8")).map((c) => c.id));
const dir = path.join(root, "data/entries");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));

test("every entry file passes the schema", () => {
  const problems = [];
  files.forEach((f) => {
    const e = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    if (e.id + ".json" !== f) problems.push(f + ": id does not match file name");
    problems.push(...validateEntry(e, cats, f));
  });
  assert.deepStrictEqual(problems, []);
});

test("the site builds and has the pages it should", () => {
  const out = execFileSync("node", ["build.js"], { cwd: root, encoding: "utf8" });
  assert.match(out, /Public build: \d+ entries/);
  for (const f of ["index.html", "about.html", "terms.html", "privacy.html", "saved.html", "sitemap.xml", "_headers", "manifest.webmanifest", "category/scholarships.html", "uni/qut.html"]) {
    assert.ok(fs.existsSync(path.join(root, "dist", f)), f + " is missing");
  }
  const sitemap = fs.readFileSync(path.join(root, "dist/sitemap.xml"), "utf8");
  assert.ok(!sitemap.includes("saved.html"), "the saved page should not be in the sitemap");
});
