/* Checks one entry against the site's schema. Used by build.js and scripts/merge.js,
   so an entry that would break the build is caught before it's written. */
"use strict";
const Hub = require("./assets/shared.js");

const STATUSES = ["verified", "rechecking", "unverified"];
const CADENCES = ["high", "medium", "low"];
const MATCH_KEYS = new Set(Hub.QUESTIONS.map((q) => q.key));
const OPTION_VALUES = Object.fromEntries(
  Hub.QUESTIONS.filter((q) => q.options).map((q) => [q.key, new Set(q.options.map((o) => o[0]))])
);
const LIST_FIELDS = ["who", "need", "how", "catches", "tags"];

function validateEntry(e, categoryIds, where) {
  const p = [];
  const at = (msg) => p.push(where + ": " + msg);
  ["id", "name", "provider", "category", "summary", "status", "verified", "review"].forEach((k) => {
    if (!e[k] || typeof e[k] !== "string") at("missing " + k);
  });
  if (e.id && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(e.id)) at("id must be lowercase words joined by hyphens");
  if (!e.source || !/^https:\/\//.test(e.source.url || "")) at("source.url must be an https link");
  if (e.source && !e.source.label) at("source.label is missing");
  if (e.category && !categoryIds.has(e.category)) at("unknown category " + e.category);
  if (e.status && !STATUSES.includes(e.status)) at("status must be one of " + STATUSES.join(", "));
  if (e.cadence && !CADENCES.includes(e.cadence)) at("cadence must be one of " + CADENCES.join(", "));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.verified || "")) at("verified must be YYYY-MM-DD");
  if (e.cap && e.cap !== "maybe") at('cap can only be "maybe"');
  if (e.closes !== undefined && !(e.closes === "closed" || e.closes === "ongoing" || /^\d{4}-\d{2}-\d{2}$/.test(e.closes))) at('closes must be YYYY-MM-DD, "ongoing" or "closed"');
  if (e.kind !== undefined && !Hub.KINDS.includes(e.kind)) at("kind must be one of " + Hub.KINDS.join(", "));
  if (e.claim !== undefined && !Hub.CLAIMS.includes(e.claim)) at("claim must be one of " + Hub.CLAIMS.join(", "));
  if (e.cost !== undefined && !Hub.COSTS.includes(e.cost)) at("cost must be one of " + Hub.COSTS.join(", "));
  if (e.vlabel !== undefined && !["You get", "You pay", "You save", "Cost"].includes(e.vlabel)) at('vlabel must be "You get", "You pay", "You save" or "Cost"');
  if (e.institution !== undefined && !Hub.INST_NAME[e.institution]) at("institution " + e.institution + " is not in the institution list in shared.js");
  if (e.states !== undefined && !(Array.isArray(e.states) && e.states.every((x) => Hub.STATES.some((s) => s[0] === x)))) at("states must be a list of state ids such as qld or nsw");
  if (e.openToAll !== undefined && e.openToAll !== true) at("openToAll can only be true");
  if (!Object.keys(e.match || {}).length && !e.openToAll) at("add at least one match rule, or set openToAll to true if any student can claim it");
  if (e.openToAll && Object.keys(e.match || {}).length) at("openToAll entries should have no match rules");
  if (e.affiliate !== undefined) {
    if (!e.affiliate || !/^https:\/\//.test(e.affiliate.url || "")) at("affiliate.url must be an https link");
    if (e.kind === "Government" || e.kind === "Uni" || ["payments", "loans", "tax", "scholarships", "campus", "tafe", "bills"].includes(e.category)) at("affiliate links are never allowed on government, uni or study-support entries");
  }
  if (e.value !== undefined && (typeof e.value !== "string" || e.value.length > 24)) at("value must be a short string such as \"Free\" or \"$1,000\"");
  LIST_FIELDS.forEach((k) => {
    if (e[k] !== undefined && !(Array.isArray(e[k]) && e[k].every((x) => typeof x === "string"))) at(k + " must be a list of sentences");
  });
  if (e.numbers !== undefined && !(Array.isArray(e.numbers) && e.numbers.every((r) => Array.isArray(r) && r.length === 2))) at("numbers must be [label, value] pairs");
  (e.extra_sources || []).forEach((s, i) => { if (!/^https:\/\//.test(s.url || "")) at("extra_sources[" + i + "].url must be an https link"); });
  Object.keys(e.match || {}).forEach((k) => {
    if (!MATCH_KEYS.has(k)) { at("unknown match key " + k); return; }
    const cond = e.match[k];
    if (k === "age") return;
    ["yes", "maybe", "no"].forEach((arm) => (cond[arm] || []).forEach((v) => {
      if (!OPTION_VALUES[k].has(v)) at("match." + k + "." + arm + " has unknown value " + v);
    }));
  });
  return p;
}

module.exports = { validateEntry, CADENCE_DAYS: { high: 45, medium: 90, low: 180 } };
