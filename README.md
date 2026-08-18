# Machine

AI-assisted content pipeline for publishing coloring books to Amazon KDP. See `CLAUDE.md` for the full project brief, agent responsibilities, and build order.

## Status

Repo scaffold + manifest schema (build order step 1). Agents are not yet implemented.

## Structure

```
/agents      one folder per agent (scout, loom, bindery, crier, ledger)
/batches     per-batch working data, created at runtime — none yet
/dashboard   status dashboard, built in step 6
/schemas     the batch manifest schema (zod) and its stage-progression rules
/scripts     CLI utilities, e.g. manifest validation
```

## Setup

```
npm install
```

## Commands

```
npm run typecheck          # TypeScript type checking
npm test                   # run the test suite (vitest)
npm run validate:manifest -- <path-to-manifest.json>   # validate a batch manifest
```
