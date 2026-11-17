# Discovery prompt

Use this to find new entries for StudentStack. Paste everything below the line into a research agent, with a scope (a university, a state, a category) and the current date. Give it `research/existing-ids.txt` so it skips what the site already has.

---

You are finding concessions, scholarships, payments and discounts for Australian university and TAFE students, for a site where every entry links to an official page.

## What counts
- Money or savings a student can get: government payments and loans, concession cards and fares, scholarships and bursaries, hardship funds, campus services, health and bills concessions, software and tech discounts, student memberships.
- Something real and current. Skip anything closed for good. Keep rounds that will open again and put the dates in `catches`.
- It must be open to students as students, not a general sale or a deal that only a retailer advertises.

## Sourcing rule
- Every entry needs an official source: the provider's own page (a .gov.au site, the university or TAFE, the company itself).
- Open the page before writing from it. The `evidence` quote must be text the page showed. Never write from a search snippet or from memory.
- If you can't open a page, find another official page, or list it as a lead instead of an entry.
- Never invent a figure. Leave a field out when the page doesn't say.

## Output
A JSON array, no code fence. One object per entry:

```
{ "id": "provider-short-name", "name": "", "provider": "", "category": "", "summary": "",
  "key": "headline figure", "who": [], "need": [], "how": [], "catches": [],
  "numbers": [["label", "value"]],
  "source": { "url": "", "label": "" }, "extra_sources": [],
  "evidence": "quote from the page", "verified": "YYYY-MM-DD", "status": "verified",
  "cadence": "high|medium|low", "closes": "YYYY-MM-DD (only if stated)",
  "institution": "qut", "states": ["qld"], "vlabel": "You get|You pay|You save|Cost",
  "match": {} }
```

Categories: payments, loans, tax, tafe, scholarships, campus, transport, bills, health, software, tech, streaming, career.

## Match rules (who it applies to)
Every entry needs `match` rules or `"openToAll": true` (and then no `match`).
- Keys: `state`, `campus`, `age`, `load`, `res`, `uni`, `field`, `payment`, `away`, `prac`, `atsi`, `level`, `year`, `hcc`, `regional`, `disability`, `parent`, `gender`.
- Each value is `{ "yes": [...], "maybe": [...] }` or `{ "no": [...] }`. Age is `{ "min": 18, "max": 24 }`.
- `state` and `campus` use: nsw, vic, qld, wa, sa, tas, act, nt. SA, Tasmania and the NT are separate.
- `uni` takes the id of the one university (for example `qut`, `monash`), or `tafe`, `apprentice` or `other`. TAFE entries use `{"yes":["tafe"],"maybe":["apprentice"]}`; apprentice entries use the reverse. Only an entry that really is limited to one institution gets an institution id.
- Government payments need a residency rule such as `{"yes":["citizen","pr"],"maybe":["intl"]}`.
- Use `no` rules only for level and gender. Everything else uses yes/maybe so a student isn't wrongly ruled out.

## Search ideas
Hardship and emergency grants; accommodation and rent scholarships; first-in-family and regional bursaries; Aboriginal and Torres Strait Islander scholarships; carers and parents; study-area scholarships (engineering, nursing, teaching); state travel concessions; energy and water concessions; TAFE fee-free and apprenticeship support; student memberships of professional bodies; software, hardware and subscription discounts.
