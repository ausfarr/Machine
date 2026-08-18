# Coloring Book Pipeline — Project Brief

## What this is

An AI-assisted content pipeline for publishing coloring books to Amazon KDP. This repo owns everything from niche research through print-ready file generation and listing copy. It does not publish anything automatically — every batch ends in a pull request for human review.

## Explicit scope (v1)

**In scope:**
- Coloring books only, sold via Amazon KDP (paperback, low-content)
- Niche/keyword research
- Prompt generation for an external AI image tool
- Interior PDF assembly from human-supplied images
- Listing metadata generation (title, keywords, categories, description)
- A dashboard showing real pipeline status

**Explicitly out of scope for v1 — do not build:**
- General print-on-demand / Etsy / Shopify integration
- Any trading, market-signal, or financial automation
- Actual image generation (no image-gen API calls — this repo produces prompts; a human runs them externally)
- Auto-publishing to Amazon or any platform
- Any fabricated or placeholder metrics on the dashboard — it only ever shows real data pulled from this repo's own run history

## Agents (modules)

Each agent is a self-contained script with one job.

### Scout — niche & keyword research
- Input: a rough theme or category
- Output: a research report (`.json` + `.md`) — competition level, search-volume signals, suggested angle
- Does not decide what to build next; a human reads the report and greenlights a theme

### Loom — prompt generation
- Input: an approved theme from Scout's output
- Output: a batch of 20–30 image prompts (`.json`), formatted for an external tool (Ideogram/Firefly/etc.), plus draft front/back matter text
- Does not call any image generation API. Prompts are meant to be pasted into an external tool by hand.

### Bindery — interior assembly
- Input: a folder of human-supplied final images (`/batches/{batch-id}/images/`)
- Output: a print-ready interior PDF meeting KDP's trim size, margin, and bleed specs (8.5x11 default)
- Validates image count, resolution, and page order before assembling; fails loudly if anything's missing rather than silently producing a broken file

### Crier — listing metadata
- Input: the approved batch (theme, title candidates, front/back matter)
- Output: KDP-ready title, subtitle, 7 keyword slots, category suggestions, description
- Flags all output as AI-generated content in the batch manifest, for KDP's disclosure step — this repo never obscures that

### Ledger — status & dashboard data
- Reads run logs and batch manifests across the repo
- Outputs the data file the dashboard renders
- Never invents numbers. If something hasn't run yet, it shows "not yet run," not a placeholder figure.

## Data flow

```
Scout → research report → [human: pick a theme]
  → Loom → prompt batch → [human: generate images externally, drop in /batches/{id}/images/]
  → Bindery + Crier (run together once images exist) → interior PDF + listing copy
  → [human: proof, disclose, publish]
```

Each batch lives in `/batches/{batch-id}/` with a `manifest.json` tracking its stage: `researched` → `prompted` → `imaged` → `assembled` → `listed` → `published`.

## Tech stack

- **Language:** TypeScript / Node.js
- **PDF assembly:** `pdf-lib`
- **Image handling:** `sharp`
- **Dashboard:** React + Vite + Tailwind, static build deployed via GitHub Pages
- **Automation:** GitHub Actions
  - Scheduled workflow runs Scout + Loom weekly against a queue of candidate themes
  - A workflow triggers on new images landing in a batch folder, runs Bindery + Crier, opens a PR
  - No workflow ever auto-merges or auto-publishes

## Folder structure

```
/agents
  /scout
  /loom
  /bindery
  /crier
  /ledger
/batches
  /{batch-id}/
    manifest.json
    research.md
    prompts.json
    images/        (human-populated)
    interior.pdf
    listing.json
/dashboard
/.github/workflows
CLAUDE.md
```

## Build order

Build and PR one agent at a time, in this order, so each can be reviewed independently:
1. Repo scaffold + manifest schema
2. Scout
3. Loom
4. Bindery
5. Crier
6. Ledger + dashboard
7. GitHub Actions workflows

Do not build the dashboard before agents 2–5 exist — it needs real data to render against.

## Guardrails

- No fabricated data anywhere, including in placeholder/demo states
- No agent calls an external paid API without that being explicitly stated in this file first
- No agent auto-publishes, auto-purchases, or takes any irreversible action
- If a step's output looks wrong, fail with a clear error rather than proceeding with bad data
