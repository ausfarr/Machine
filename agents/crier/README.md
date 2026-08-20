# Crier

Listing metadata. Takes an assembled batch and writes KDP-ready title,
subtitle, 7 keyword slots, category suggestions, and a description.

## Usage

```
npm run crier -- <batch-id>
```

Requires the batch's `manifest.json` to be at stage `assembled` (Bindery
has run). Writes `listing.json` and updates `manifest.json` to stage
`listed`.

## AI content disclosure

Crier's manifest field `crier.aiGeneratedDisclosure` is hard-coded `true`
in the schema — it cannot be written any other way. `listing.json` also
carries a `disclosureNote` reminding the human publisher that Amazon KDP
requires AI-generated content to be disclosed at the point of publishing.
This repo never obscures that its listing copy is AI-generated.

## How listing copy is generated

Crier has no live Amazon keyword-research or category-tree API — the same
constraint as Scout and Loom, nothing is authorized in CLAUDE.md for it.
So:

- **Keywords** reuse Scout's keyword-variant heuristic (`generateKeywordVariants`)
  plus a few generic coloring-book phrases, deduplicated down to exactly 7,
  each truncated to KDP's 50-character keyword limit.
- **Categories** are two real, commonly-used KDP coloring-book category
  paths, not a live category-tree lookup — `listing.json` flags this with
  a `categoryNote` telling the human to confirm the exact path in KDP's
  category picker before publishing.
- **Title and subtitle** are templated from the batch's own theme, page
  count, and its `illustrationStyle` (from `manifest.opportunityScanner`,
  when present — defaults to `coloring-book` for a batch created via
  `npm run scout` directly). Loom's cover-art prompt embeds this exact
  same title (see `agents/loom/README.md`), so the two can never diverge.
- **Description** is templated from the batch's own theme, page count, and
  Scout's suggested angle — not invented market copy.

**Known v2 gap — illustrated batches:** keywords, categories, and the
description body are still coloring-book-only — v2's multi-category
expansion generalized title/subtitle first because Loom's cover art
depends on them staying in sync, but a picture-book batch will still get
a coloring-book-flavored `listing.json` for these fields until Crier gets
the same per-category treatment.

**Text-only (Writer-sourced) batches — refused, not mis-generated:** now
that Bindery's manuscript-typesetting mode can move a text-only batch to
stage `assembled`, `runCrier` throws immediately for any batch with
`opportunityScanner.contentType === "text"`, rather than writing a
`listing.json` that would call a poetry or fiction manuscript a "coloring
book." This is a deliberate refusal, not a placeholder pass-through — per
CLAUDE.md's "if a step's output looks wrong, fail with a clear error
rather than proceeding with bad data" guardrail. A text batch stays at
stage `assembled` (interior PDF real and complete) until Crier is
generalized for text categories.

## Files

- `templates.ts` — title/subtitle/keyword/category/description generation
- `index.ts` — `runCrier()`, the agent's entry point
- `cli.ts` — CLI wrapper (`npm run crier`)
