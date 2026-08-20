# Loom

Prompt generation. Takes an already-researched batch and writes a batch of
image prompts, plus draft front/back matter copy.

## Usage

```
npm run loom -- <batch-id>
```

Requires the batch's `manifest.json` to be at stage `researched` (i.e.
Scout has already run — Scout's Claude-driven theme selection is the
approval this pipeline requires, not a separate human step before Loom).
Writes `prompts.json`, `front-back-matter.md`, and updates
`manifest.json` to stage `prompted`.

## What it does not do

- Does not call any image generation API itself — Loom produces text
  prompts only. Etch is the agent that turns them into images (via the
  Gemini API); a human can also paste them into an external tool by hand
  instead, dropping the results into the batch's `images/` folder.
- Does not decide which theme to run — that decision already happened in
  Scout.

## How prompts are generated

Loom has no subject-extraction or image-generation API, so it crosses the
approved theme with a fixed library of 30 composition/framing templates
rather than inventing "real" subject research. Prompt style is
category-aware: `templates.ts` defines one self-contained
`IllustrationStyleTemplates` config per `IllustrationStyle` (currently
`coloring-book` — black-and-white line art, bold outlines, no color — and
`picture-book` — full-color, warm, narrative children's-book
illustration), each with its own composition templates, cover-art style
guidance, and front/back matter copy. Loom picks the style from
`manifest.opportunityScanner.illustrationStyle` (set by Opportunity
Scanner); a batch created by running `npm run scout` directly on a theme
(no Opportunity Scanner data) falls back to `coloring-book`, preserving
v1 behavior for manual testing. A shared `styleGuidance` string for the
chosen style is included once in `prompts.json` so every prompt is
interpreted consistently — Etch reads this generically and never branches
on which style it is.

The cover prompt (`cover.prompt` in `prompts.json`) bakes in the same
title Crier independently builds for `listing.json` — both call
`buildTitle()` from `agents/crier/templates.ts` with the same
`illustrationStyle`, so the two can never diverge.

## Files

- `templates.ts` — `ILLUSTRATION_STYLES` (per-style guidance, composition templates, cover-prompt builder, front/back matter draft generators)
- `index.ts` — `runLoom()`, the agent's entry point
- `cli.ts` — CLI wrapper (`npm run loom`)
