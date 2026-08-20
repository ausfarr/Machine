# Machine

AI-assisted content pipeline for publishing books to Amazon KDP — coloring books plus, as of v2, any other KDP category Opportunity Scanner selects (children's books, poetry collections, short fiction, and other low-content or text-only formats). See `CLAUDE.md` for the full project brief, agent responsibilities, and build order.

## Status

All v1 build-order steps are complete: repo scaffold, Scout, Loom, Bindery, Crier, Ledger + dashboard, GitHub Actions workflows, and Etch (image generation) with full pipeline automation.

v2 (multi-category expansion) is also complete and wired end to end: Opportunity Scanner picks this week's KDP category (Claude + web_search), Scout researches a theme within it (now category-aware), and the pipeline branches — illustrated categories go through Loom + Etch as before; text-only categories go through the new Writer agent (full manuscript generation via the Anthropic API) and Bindery's new manuscript-typesetting assembly mode. `npm run process-queue` and the scheduled `pipeline.yml` workflow run the whole branching flow unattended. Nothing here auto-publishes — every batch still ends in a pull request for human review.

**Known gaps:**
- Crier (listing metadata) is not yet generalized past coloring-book categories — a picture-book batch gets a coloring-book-flavored `listing.json`, and a text-only batch's `runCrier` call refuses to run at all (fails loudly rather than mislabeling a poetry or fiction manuscript as a coloring book) — see `agents/crier/README.md`. A text-only batch's pipeline PR stops at stage `assembled`, with the manuscript excerpt and a proofread-closely flag surfaced in the PR body instead.
- Scout doesn't yet use the `web_search` tool CLAUDE.md's Scout section calls for — its research/competition/keyword estimates are still pure LLM estimates, same as v1. It is category-aware (v2's actual requirement for correct routing), just not yet search-grounded — see `agents/scout/README.md`.

## Structure

```
/agents      one folder per agent (opportunity-scanner, scout, loom, etch, writer, bindery, crier, ledger)
/batches     per-batch working data, created at runtime — none yet
/dashboard   status dashboard (React + Vite + Tailwind), deployed via GitHub Pages
/schemas     the batch manifest schema (zod) and its stage-progression rules
/scripts     CLI utilities (manifest validation, pipeline orchestration)
/.github/workflows   automation — see .github/workflows/README.md
theme-queue.json     candidate themes for the weekly pipeline workflow
```

## Setup

```
npm install
cd dashboard && npm install
```

Set `ANTHROPIC_API_KEY` (Opportunity Scanner, Scout, Writer, Sentinel) and
`GEMINI_API_KEY` (Etch) in your environment for local runs, and as repo
secrets for the `pipeline.yml` workflow. Each is scoped to specific agents
— see CLAUDE.md's "Authorized external APIs" section.

## Commands

```
npm run typecheck          # TypeScript type checking
npm test                   # run the test suite (vitest)
npm run validate:manifest -- <path-to-manifest.json>   # validate a batch manifest

npm run opportunity-scanner          # pick this week's KDP category (standalone)
npm run scout -- "a rough theme"     # research one theme directly, create a batch (defaults to coloring-book framing)
npm run loom -- <batch-id>           # generate prompts for a researched illustrated batch
npm run etch -- <batch-id>           # generate images for a prompted batch via Gemini
npm run writer -- <batch-id>         # generate a full manuscript for a researched text-only batch
npm run bindery -- <batch-id>        # assemble the interior PDF (image-grid or manuscript-typesetting mode)
npm run crier -- <batch-id>          # generate listing copy for an assembled illustrated batch (throws on text-only — see "Known gap" above)
npm run ledger                       # refresh dashboard/public/status.json

npm run process-queue                # run the full branching pipeline end to end on one auto-selected category + theme
```

## The theme queue (optional)

`theme-queue.json` (repo root) is a plain JSON array of candidate theme
strings — it starts empty and can stay empty. Scout proposes its own
fresh candidate themes via the Anthropic API on every run (avoiding
themes already produced), so the pipeline never depends on a human
seeding it. Add a theme here only if you want to make sure a specific
idea gets considered alongside Scout's own — Scout still ranks it against
everything else and may or may not pick it.

## Pipeline data flow

```
Opportunity Scanner (Claude API + web_search: picks ONE best KDP category
this week; logs alternatives considered and why they were passed over)
  → Scout (Claude API: picks + researches a theme within that category;
    theme-queue.json optionally seeds candidates)
  → branch on the category's content type:
      - Illustrated → Loom (prompt batch) → Etch (Gemini: images) → /batches/{id}/images/
      - Text-only    → Writer (Claude API: full manuscript)
  → Bindery (image-grid mode OR manuscript-typesetting mode) → interior.pdf
  → Crier → listing.json (illustrated only — see "Known gap" above)
  → PR opened for human review
  → [human: proof, disclose, publish]
```

The whole chain runs unattended in one pipeline pass. A human can still
step in anywhere along the way — edit `prompts.json` before running Etch
by hand, or replace files in a batch's `images/` folder before running
Bindery — every agent re-validates its own inputs rather than trusting
that an earlier step got it right.

See each agent's own README under `/agents/*/README.md` for details, and
`.github/workflows/README.md` for how the pipeline runs automatically.
