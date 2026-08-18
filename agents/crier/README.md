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
- **Title, subtitle, and description** are templated from the batch's own
  theme, page count, and Scout's suggested angle — not invented market
  copy.

## Files

- `templates.ts` — title/subtitle/keyword/category/description generation
- `index.ts` — `runCrier()`, the agent's entry point
- `cli.ts` — CLI wrapper (`npm run crier`)
