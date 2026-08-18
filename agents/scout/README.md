# Scout

Niche/keyword research. Takes a rough theme or category and writes a
research report to a new `/batches/{batch-id}/` folder.

## Usage

```
npm run scout -- "a rough theme or category"
```

Writes `research.json`, `research.md`, and `manifest.json` (stage:
`researched`) into a new batch folder. Does not decide what happens next —
a human reads the report and greenlights (or discards) the theme.

## How competition/angle signals are generated

Scout calls no external API — CLAUDE.md only allows an agent to call a
paid external API when that's explicitly stated there, and nothing is
stated for Scout. So `competitionLevel` and `suggestedAngle` are
deterministic heuristics derived from the theme text itself (matches
against a static list of known-saturated coloring-book niches, presence of
a differentiating style/audience modifier, word count) — not live
Amazon/Google search-volume data. Every report says so explicitly in its
`methodologyNote` field, per the "no fabricated data" guardrail.

## Files

- `heuristics.ts` — competition scoring, angle suggestion, keyword variant generation
- `slug.ts` — batch ID generation (never overwrites an existing batch)
- `index.ts` — `runScout()`, the agent's entry point
- `cli.ts` — CLI wrapper (`npm run scout`)
