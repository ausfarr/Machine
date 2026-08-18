# Machine

AI-assisted content pipeline for publishing coloring books to Amazon KDP. See `CLAUDE.md` for the full project brief, agent responsibilities, and build order.

## Status

All build-order steps are complete: repo scaffold, Scout, Loom, Bindery, Crier, Ledger + dashboard, GitHub Actions workflows, and Etch (image generation) with full pipeline automation. Scout now selects and researches themes via the Anthropic API, and Etch generates interior images via the Gemini API — see CLAUDE.md's "Authorized external APIs" section. Nothing here auto-publishes — every batch still ends in a pull request for human review.

## Structure

```
/agents      one folder per agent (scout, loom, etch, bindery, crier, ledger)
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

Set `ANTHROPIC_API_KEY` (Scout) and `GEMINI_API_KEY` (Etch) in your
environment for local runs, and as repo secrets for the `pipeline.yml`
workflow. Each is scoped to exactly one agent — see CLAUDE.md.

## Commands

```
npm run typecheck          # TypeScript type checking
npm test                   # run the test suite (vitest)
npm run validate:manifest -- <path-to-manifest.json>   # validate a batch manifest

npm run scout -- "a rough theme"     # research one theme directly, create a batch
npm run loom -- <batch-id>           # generate prompts for a researched batch
npm run etch -- <batch-id>           # generate images for a prompted batch via Gemini
npm run bindery -- <batch-id>        # assemble the interior PDF (images from Etch or hand-supplied)
npm run crier -- <batch-id>          # generate listing copy for an assembled batch
npm run ledger                       # refresh dashboard/public/status.json

npm run process-queue                # run the full pipeline end to end on one auto-selected theme
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
Scout (Claude API: generate + research + auto-select a theme; theme-queue.json optionally seeds candidates)
  → Loom → prompt batch
  → Etch (Gemini API: generate images from prompts) → /batches/{id}/images/
  → Bindery + Crier → interior PDF + listing copy
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
