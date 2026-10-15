# Scheduled recheck run

Follow these steps exactly. Keep the run small and cheap: one fetch per entry, no extra research.

1. In the repo folder, run `node scripts/due.js --brief --limit 25`. This prints up to 25 overdue entries as JSON (id, name, key, who, closes, url). If it prints `[]`, stop: nothing is due.
2. For each entry, call WebFetch on its `url` once, with this prompt:
   "Does this page still offer [name]? Quote the exact sentence that states [key], and the sentence that says who is eligible. If a closing date is shown, give it as YYYY-MM-DD. If the offer has ended or the page no longer describes it, say so."
   Do not use WebSearch, and do not fetch any other page. If the fetch fails or redirects, retry once on the redirect URL only.
3. Decide one result per entry:
   - `confirmed`: the page still states the same figure and eligibility. Put the quoted sentence in `quote`, and any future closing date in `closes`.
   - `closed`: the page says the current round has closed and gives no future date.
   - `changed`: the page states a different figure, different eligibility, or the offer has ended. Put what differs in `note` and the page's sentence in `quote`.
   - `gone`: the page failed to load twice, redirected somewhere unrelated, or no longer mentions the offer.
   Only use text the fetched page showed. Never write a quote from memory. When unsure, choose `changed`, because a person will look at it.
4. Write the results as a JSON array to `research/recheck-results.json`, for example:
   `[{"id":"...","result":"confirmed","quote":"...","closes":"2026-11-30"}]`
5. Run `node scripts/recheck.js research/recheck-results.json --write`, then `node build.js`. If either reports an error, fix the results file and run them again.
6. Delete `research/recheck-results.json`. Commit everything with the message `Scheduled recheck <date>` and push to `main`. Netlify publishes the update automatically.
7. Finish with a short summary of at most 6 lines: how many entries were confirmed, closed, changed and gone, and the ids of any changed or gone entries. Those entries stay on the site as "Might apply" until a person reviews them. The full list is in `research/recheck-log.md`.
