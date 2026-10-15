# Brief for discovery agents (second run, 15 Oct 2026)

You're one of seven research agents adding new entries to an Australian student concessions website. Your scope is in your task message. The other agents cover other scopes at the same time.

1. Read `/home/claude/gemini-discovery-prompt.md`. Follow everything below its `---` line (what counts, the sourcing rule, the output shape, the match rules, the search ideas). Ignore its own EXISTING IDS list and its "at least 40" target. Use `/home/claude/student/research/existing-ids.txt` instead (627 entries already on the site) and skip anything there or a near-duplicate of it. If unsure, grep `/home/claude/student/data/entries/` for the provider name.
2. Research with WebSearch and WebFetch. **Open every official page with WebFetch before you write an entry from it.** The `evidence` quote must be text the fetched page actually showed. Never write a quote from a search snippet or from memory. If a page can't be fetched, find another official page that says the same thing, or leave the entry out and list it as a lead.
3. Aim for 15 to 25 good entries. Keep searches efficient: the shared search and fetch limits ran out on the last run. Prefer more entries with fewer fields over fewer entries with more fields, but every field you fill must come from the fetched page.
4. Today's date is 2026-10-15. Use it for `verified`. Leave out anything that has closed for good. Keep anything with a future round, and put the dates in `catches`. If a closing date is stated, also set `"closes": "YYYY-MM-DD"`.
5. IDs must be lowercase words joined by hyphens, start with the provider (for example `utas-hardship-grant`), and be unique.
6. Write the JSON array (no code fence, just the array) to the output file named in your task message, using the Write tool.
7. Validate it: run `node /home/claude/student/scripts/merge.js <your file>` with Bash. This is a dry run and writes nothing. If it reports problems, fix the file and run it again until it lists your entries as NEW. **Never add `--write`.** The lead agent merges everything.
8. Finish with a short reply of no more than 12 lines: the number of entries, verified versus unverified counts, the five most valuable finds, pages that blocked you, and unconfirmed leads with URLs.
