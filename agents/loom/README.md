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
(close-up, wide shot, low angle, decorative border, cross-section, etc.)
rather than inventing "real" subject research. A shared `styleGuidance`
string (black-and-white line art, bold outlines, no color, 8.5x11in KDP
page) is included once so every prompt is interpreted consistently.

## Files

- `templates.ts` — style guidance, composition templates, front/back matter draft generators
- `index.ts` — `runLoom()`, the agent's entry point
- `cli.ts` — CLI wrapper (`npm run loom`)
