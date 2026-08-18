# Machine

AI-assisted content pipeline for publishing coloring books to Amazon KDP. See `CLAUDE.md` for the full project brief, agent responsibilities, and build order.

## Status

All 7 build-order steps are complete: repo scaffold, Scout, Loom, Bindery, Crier, Ledger + dashboard, and GitHub Actions workflows. Nothing here auto-publishes — every batch still ends in a pull request for human review.

## Structure

```
/agents      one folder per agent (scout, loom, bindery, crier, ledger)
/batches     per-batch working data, created at runtime — none yet
/dashboard   status dashboard (React + Vite + Tailwind), deployed via GitHub Pages
/schemas     the batch manifest schema (zod) and its stage-progression rules
/scripts     CLI utilities (manifest validation, theme queue processing)
/.github/workflows   automation — see .github/workflows/README.md
theme-queue.json     candidate themes for the weekly Scout+Loom workflow
```

## Setup

```
npm install
cd dashboard && npm install
```

## Commands

```
npm run typecheck          # TypeScript type checking
npm test                   # run the test suite (vitest)
npm run validate:manifest -- <path-to-manifest.json>   # validate a batch manifest

npm run scout -- "a rough theme"     # research a theme, create a batch
npm run loom -- <batch-id>           # generate prompts for a researched batch
npm run bindery -- <batch-id>        # assemble the interior PDF once images are in images/
npm run crier -- <batch-id>          # generate listing copy for an assembled batch
npm run ledger                       # refresh dashboard/public/status.json

npm run process-queue                # pop the next theme.json entry and run Scout+Loom on it
```

## The theme queue

`theme-queue.json` (repo root) is a plain JSON array of theme strings —
starts empty, and stays empty until a human adds candidate themes to it.
Adding a theme here is the approval the weekly `scout-loom.yml` workflow
needs to run Loom on it automatically; nothing is pre-populated.

## Pipeline data flow

```
Scout → research report → [human: pick a theme]
  → Loom → prompt batch → [human: generate images externally, drop in /batches/{id}/images/]
  → Bindery + Crier (run together once images exist) → interior PDF + listing copy
  → [human: proof, disclose, publish]
```

See each agent's own README under `/agents/*/README.md` for details, and
`.github/workflows/README.md` for how the pipeline runs automatically.
