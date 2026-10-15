# Student Concessions Hub

A static website listing concessions for Australian uni students. Every entry is checked against an official source. It has no framework and no dependencies, so the only thing you need is Node 18 or newer.

## Build it

```
node build.js            # public site -> dist/   (approved entries only)
node build.js --preview  # review site -> preview/ (every entry, drafts marked)
```

Open `dist/index.html` or `preview/index.html` in a browser to look at it. Every link is relative, so it works straight from your computer.

The build stops if an entry file has a mistake, such as a missing field, an unknown category or a link that isn't https, and tells you which file to fix. It also lists any entries that are overdue for a recheck.

## Put it online (free)

**Netlify, connected to GitHub (recommended).** Netlify rebuilds the site every time you change an entry.
1. Push this folder to a new GitHub repository.
2. In Netlify, choose Add new site, then Import from Git, and pick the repository.
3. `netlify.toml` already sets the build command (`node build.js`) and the folder to publish (`dist`), so accept the defaults.
4. Once it's live, put the site address in `siteUrl` in `site.config.json`. The build then writes a sitemap so Google can find every entry page.

**Fastest test.** Run `node build.js`, then drag the `dist` folder onto Netlify Drop at app.netlify.com/drop.

GitHub Pages and Cloudflare Pages work too. Use `node build.js` as the build command and `dist` as the output folder.

## Add or change an entry

Each concession is one file in `data/entries/`. The file name must match its `id`.

| Field | What it is |
|---|---|
| `id`, `name`, `provider`, `category`, `summary` | Required. `category` must be an id from `data/categories.json`. |
| `key` | The one-line headline figure. Optional. |
| `who`, `need`, `how`, `catches` | Lists of plain sentences. `how` shows as numbered steps. |
| `numbers` | Table rows as `["label", "value"]` pairs. |
| `source`, `extra_sources` | Official pages: `{ "url": "https://…", "label": "…" }`. |
| `status` | `verified`, `rechecking` or `unverified`. |
| `verified` | The date it was last checked, as `YYYY-MM-DD`. |
| `cadence` | `high` (14 days), `medium` (30) or `low` (90). Sets the next-check date. |
| `review` | `approved` puts it on the public site. Anything else keeps it as a draft. |
| `match`, `cap` | Rules for the "What could you get?" questions. See below. |
| `tags` | Extra search words, such as `["opal", "train"]`. |

### Matching rules

Each key in `match` is one of the questions: `state` (where you live), `campus` (where you study), `age`, `load`, `res`, `uni`, `field`, `payment`, `away`, `prac`, `atsi`. Use `campus` for city transport concessions and `state` for anything that depends on where you live.

```json
"match": {
  "age":  { "min": 18, "max": 24 },
  "load": { "yes": ["full"] },
  "res":  { "yes": ["citizen"], "maybe": ["pr"] }
}
```

- Any answer outside `yes` or `maybe` gives "Probably not".
- `{ "no": ["yes"] }` rules out only the listed answers.
- A skipped question never rules anything out. It gives "Might apply".
- `"cap": "maybe"` stops an entry ever showing as "Likely for you". Use it when eligibility depends on something the questions don't ask.
- Any entry whose `status` isn't `verified` is also held at "Might apply" automatically.

The logic lives in `src/assets/shared.js`. The build and the browser both use it, so they always agree.

## Card facts, deadlines and the saved list

Each card shows a value figure, who offers it, how you get it, and a deadline chip. Most of these are worked out at build time from the entry text (`derive()` in `src/assets/shared.js`). Set any of these optional fields on an entry to override the guess:

- `value`: the headline figure, such as `"$6,000"`. `kind`: Government, Uni, Company or Professional body. `claim`: Apply or sign up, Show a card or code, or Automatic. `cost`: Free, Discount or Money to you.
- `closes`: `"YYYY-MM-DD"`, `"ongoing"` or `"closed"`. Cards show "Closes in N days" when it is 14 days or fewer away, and "Round closed" once the date passes.

`node scripts/extract-closes.js --write` fills `closes` from dates already stated in the entry text (add `--force` to redo, `--why` to see the reasoning). Keep dates fresh by re-running it after each VERIFY run, and check any date that looks wrong against the official page.

`site.config.json` has `collections`, the "Start from your situation" tiles on the home page. Each has an `id`, `name`, `blurb`, and either `any` (words to look for) or `cats` (category ids).

Visitors can save entries with the heart. The list lives in their browser (`localStorage`), and `saved.html` shows it with Print and Copy as text. Nothing is sent to a server.

## Folder layout

```
data/categories.json   categories, in the order they appear
data/entries/*.json    one file per concession
site.config.json       site name, address, contact email, coverage line
src/assets/            styles, browser script and shared matching logic
build.js               turns the above into dist/ or preview/
```

## Before launch

`node build.js` prints a checklist of anything still missing. In `site.config.json`:

- `siteUrl`: your live address, such as `https://studentconcessions.com.au`. This turns on canonical links and `sitemap.xml`. Then submit the sitemap in Google Search Console.
- `ownerName` and `contactEmail`: shown on the About and Privacy pages and in the footer, so readers know who runs the site.
- `reportForm`: `"netlify"` uses the built-in report page, which works on Netlify with no setup. Netlify lists reports under Forms in your site dashboard. Alternatively, set it to a Google Form link, or to `""` to hide the report links.
- `analytics` (optional): cookie-free visit counts. Either `{"provider": "plausible", "domain": "yourdomain"}` or `{"provider": "cloudflare", "token": "..."}`. The privacy page updates itself to match.

## Keeping the data current

A scheduled task rechecks the most overdue entries three times a week by following `scripts/RECHECK.md` (`due.js --brief --limit 25`, one page fetch each, then `scripts/recheck.js`). Changed or missing offers become "rechecking" and stay live as "Might apply" until you review them in `research/recheck-log.md`. Recheck intervals: high 45 days, medium 90, low 180.


The entry files in `data/entries/` are the only source of truth. Every tool reads and writes them.

```
node scripts/due.js              list entries due for a recheck (or not yet verified)
node scripts/due.js --json       those entries as JSON, to paste into the research prompt in VERIFY mode
node scripts/due.js --sheet      the same claims as CSV rows for the Gemini sheet's Requests tab
node scripts/merge.js out.json   preview what a research agent's output would change
node scripts/merge.js out.json --write   save it
```

`merge.js` checks every entry against the schema before writing anything. It sends an entry back to pending review whenever its figures, eligibility, matching rules or status change, so those always get a human check. New entries always arrive as pending.

A typical week:
1. `node scripts/due.js --json > due.json`, then run the research prompt in VERIFY mode with that file. Optionally paste `--sheet` rows into the Gemini sheet for a second opinion.
2. Save the agent's answer as `out.json` and run `node scripts/merge.js out.json`. Read the summary, then rerun it with `--write`.
3. Run `node build.js --preview`, read the drafts, and approve them by setting `"review": "approved"`.
4. Commit and push. Netlify rebuilds the live site.
