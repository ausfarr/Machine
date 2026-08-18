# Scout

Niche/keyword research and automated theme selection. Given a pool of
candidate themes, picks one to pursue and writes a research report to a
new `/batches/{batch-id}/` folder.

## Usage

```
npm run scout -- "a rough theme or category"
```

Runs Scout directly against a single theme (no selection step — useful for
testing a specific idea by hand). Writes `research.json`, `research.md`,
and `manifest.json` (stage: `researched`) into a new batch folder.

To let Scout choose from the queue of candidates in `theme-queue.json`,
use the full pipeline instead: `npm run process-queue` (see the root
`README.md`).

## Requires `ANTHROPIC_API_KEY`

Scout calls the Anthropic API — the only external API it's authorized to
call, per CLAUDE.md's "Authorized external APIs" section. It's used for
two things:

- **Theme selection** (`selectTheme`, used by the pipeline script): ranks
  every queued candidate and picks one, with a rationale for each.
- **Research** (`analyzeTheme`): estimates competition level, suggests a
  differentiating angle, and proposes keyword variants for the selected
  theme.

Both calls use Claude's structured tool-use output so results are
type-checked JSON, not parsed prose. Every report explicitly discloses
that these are the model's estimates, not live Amazon/Google
search-volume data — per the "no fabricated data" guardrail.

There's no human greenlight step between Scout and Loom anymore — Scout's
selection *is* the automated decision. The human checkpoint moved to the
end of the pipeline: the pull request a human reviews before publishing.

## Files

- `claudeClient.ts` — the Anthropic API wrapper (`selectTheme`, `analyzeTheme`), dependency-injectable for tests
- `themeSelection.ts` — validates that Claude's selection actually names one of the queued candidates
- `slug.ts` — batch ID generation (never overwrites an existing batch)
- `index.ts` — `runScout()`, the agent's entry point
- `cli.ts` — CLI wrapper (`npm run scout`)
