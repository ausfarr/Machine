# Scout

Niche/keyword research and automated theme selection. Proposes its own
candidate themes, picks one to pursue, and writes a research report to a
new `/batches/{batch-id}/` folder.

## Usage

```
npm run scout -- "a rough theme or category"
```

Runs Scout directly against a single theme (no generation/selection step,
and no Opportunity Scanner category context — useful for testing a
specific idea by hand). Writes `research.json`, `research.md`, and
`manifest.json` (stage: `researched`, no `opportunityScanner` block) into
a new batch folder; research prompts fall back to `DEFAULT_CATEGORY`
("coloring book") framing, preserving v1 behavior for this manual path.

To let Scout generate and choose from its own candidates within the
category Opportunity Scanner selected (optionally blended with
`theme-queue.json`), use the full pipeline instead: `npm run
process-queue` (see the root `README.md`).

## Requires `ANTHROPIC_API_KEY`

Scout calls the Anthropic API — the only external API it's authorized to
call, per CLAUDE.md's "Authorized external APIs" section. It's used for
three things:

- **Candidate generation** (`generateCandidateThemes`, used by the
  pipeline script): proposes fresh theme ideas so the pipeline never
  depends on a human pre-populating `theme-queue.json`, avoiding themes
  already produced by an existing batch.
- **Theme selection** (`selectTheme`, used by the pipeline script): ranks
  every candidate (generated + any queued by hand) and picks one, with a
  rationale for each.
- **Research** (`analyzeTheme`): estimates competition level, suggests a
  differentiating angle, and proposes keyword variants for the selected
  theme.

All three take an optional `category` parameter (defaulting to
`DEFAULT_CATEGORY`, "coloring book") so the pipeline script can scope
every call to whatever KDP category Opportunity Scanner selected that
week, rather than always asking for coloring-book ideas — see CLAUDE.md's
Scout section ("Operates within the category Opportunity Scanner
selected... rather than defaulting to coloring books"). `runScout()`
persists that category (plus contentType/illustrationStyle) into the
batch's manifest as `opportunityScanner`, so downstream agents (Loom,
Writer, Crier) know which branch and style to use.

**Known v2 gap:** Scout doesn't yet use the `web_search` tool for
live-grounded research — CLAUDE.md's Scout section calls for it, but this
pass only added category-awareness (a prerequisite for the pipeline to
route correctly). Research/competition/keyword estimates below are still
pure LLM estimates, same as v1.

Both calls use Claude's structured tool-use output so results are
type-checked JSON, not parsed prose. Every report explicitly discloses
that these are the model's estimates, not live Amazon/Google
search-volume data — per the "no fabricated data" guardrail.

There's no human greenlight step between Scout and Loom/Writer anymore —
Scout's selection *is* the automated decision. The human checkpoint moved
to the end of the pipeline: the pull request a human reviews before
publishing.

## Files

- `claudeClient.ts` — the Anthropic API wrapper (`selectTheme`, `analyzeTheme`), dependency-injectable for tests
- `themeSelection.ts` — validates that Claude's selection actually names one of the queued candidates
- `slug.ts` — batch ID generation (never overwrites an existing batch)
- `index.ts` — `runScout()`, the agent's entry point
- `cli.ts` — CLI wrapper (`npm run scout`)
