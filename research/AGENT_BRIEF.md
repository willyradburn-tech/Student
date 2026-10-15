# Brief for discovery agents

You're one of several research agents filling the database for an Australian student concessions website. Your scope is given in your task message. Other agents cover other scopes at the same time.

1. Read `/home/claude/gemini-discovery-prompt.md`. Follow everything below its `---` line (what counts, the sourcing rule, the output shape, the match rules, the search ideas). Ignore its own EXISTING IDS list. Use `/home/claude/concessions-hub/research/existing-ids.txt` instead, and skip anything already there.
2. Research with WebSearch and WebFetch. **Open every official page with WebFetch before you write an entry from it.** The `evidence` quote must be text the fetched page actually showed. Never write a quote from a search snippet or from memory. If a page can't be fetched, either find another official page that states the same thing or leave the entry out and list it as a lead.
3. Aim for 25 to 45 good entries. Prefer more entries with fewer fields over fewer entries with more fields, but every field you do fill must come from the fetched page.
4. Today's date is 2026-10-14. Use it for `verified`. Leave out anything that has closed for good. Keep anything with a future round, and put the dates in `catches`.
5. IDs must be lowercase words joined by hyphens, start with the provider (for example `unsw-hardship-grant`), and be unique.
6. Write the JSON array (no code fence, just the array) to the output file named in your task message, using the Write tool.
7. Validate it: run `node /home/claude/concessions-hub/scripts/merge.js <your file>` with Bash. This is a dry run and writes nothing. If it reports problems, fix the file and run it again until it lists your entries as NEW. **Never add `--write`.** The lead agent merges everything.
8. Finish with a short reply of no more than 15 lines: the number of entries, the verified versus unverified counts, the five most valuable finds, pages that blocked you, and unconfirmed leads with URLs.
