# Opportunity Scanner

Weekly KDP category/format selection. Runs before Scout: picks exactly one
category (coloring book, children's picture book, poetry collection, short
fiction, etc.) for the pipeline to pursue this week, grounded in live
web_search signal rather than pure model estimate. Scout then picks a
specific theme/niche within whatever category this selects.

## Usage

```
npm run opportunity-scanner
```

Writes `report.json` and `report.md` to a new dated folder under
`agents/opportunity-scanner/reports/`, and appends one entry to
`agents/opportunity-scanner/run-log.json` (which Ledger reads for the
dashboard, the same pattern Sentinel already uses).

To run the full pipeline (Opportunity Scanner → Scout → …), use
`npm run process-queue` instead (see the root `README.md`).

## Requires `ANTHROPIC_API_KEY`

Opportunity Scanner calls the Anthropic API with the native `web_search`
tool enabled — one of the four authorized uses of that key, per
CLAUDE.md's "Authorized external APIs" section. In one call (occasionally
two, if Claude finishes researching without immediately reporting its
selection), it:

- searches for current Amazon KDP category/bestseller/review-count and
  trend signal via `web_search`
- proposes 4-6 distinct candidate categories, spanning both illustrated
  and text-only formats
- scores every candidate, honestly marking which scores are grounded in
  real search results (`groundedInLiveSearch`) versus its own estimate
- picks exactly one — no shortlist, so the pipeline stays fully
  unattended — and reports every candidate considered, including the
  ones passed over, via a structured tool call

Every report explicitly discloses that even with live search data behind
it, this is still an automated estimate of demand, not certainty — per
the "no fabricated data" guardrail. `sourcesConsulted` in the report lists
the titles/URLs any web_search calls actually returned, for the audit
trail.

There's no human greenlight step between Opportunity Scanner and Scout —
the selection *is* the automated decision, same as Scout's own theme
selection. The human checkpoint stays at the end of the pipeline: the
pull request a human reviews before publishing.

## Files

- `claudeClient.ts` — the Anthropic API wrapper (`selectCategory`), combining the `web_search` server tool with a structured-output tool in the same call; dependency-injectable for tests
- `index.ts` — `runOpportunityScanner()`, the agent's entry point
- `cli.ts` — CLI wrapper (`npm run opportunity-scanner`)
- `reports/` — one dated folder per run, holding that run's `report.json` + `report.md`
- `run-log.json` — one entry per attempted run, read by Ledger
