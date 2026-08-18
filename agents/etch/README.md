# Etch

Image generation. Takes an already-prompted batch and generates one image
per prompt in `prompts.json`, writing them to `/batches/{batch-id}/images/`.

## Usage

```
npm run etch -- <batch-id>
```

Requires the batch's `manifest.json` to be at stage `prompted` (i.e. Loom
has already run). Writes `01.png`..`NN.png` into the batch's `images/`
folder and updates `manifest.json` to stage `imaged`, with
`images.source` set to `"etch"`.

## Requires `GEMINI_API_KEY`

Etch calls the Gemini API — the only external API it's authorized to
call, per CLAUDE.md's "Authorized external APIs" section. Each prompt is
sent along with Loom's shared `styleGuidance` string, and the result is
resized to Bindery's minimum print resolution (2550x3300px, 300 DPI at
8.5x11in) before being written to disk.

If any single image fails to generate, Etch throws immediately and leaves
the manifest at stage `prompted` rather than claiming the batch reached
`imaged` with missing or placeholder pages — per the "fail loudly" and "no
fabricated data" guardrails. The thrown error includes whatever diagnostic
Gemini provided (a `promptFeedback.blockReason`, a non-`STOP`
`finishReason`, or explanatory text), not just "no image data" — most
often this means Gemini's content-safety filters declined the prompt
(e.g. a theme phrased around a vulnerable population, like "for anxious
kids"), which a retry won't fix. When the response gives no diagnostic at
all, Etch retries once (a transient API hiccup is the likely cause) before
giving up. Re-run Etch once the underlying problem (a prompt that needs
rewording, an API outage, etc.) is fixed.

## A human can still override this

Nothing about Etch running automatically prevents a human from replacing
files in a batch's `images/` folder by hand afterward — Bindery
re-validates whatever's actually in that folder rather than trusting
Etch's manifest entry, and pushing replacement images retriggers the
`bindery-crier.yml` workflow.

## Files

- `geminiClient.ts` — the Gemini API wrapper (`generateImage`), dependency-injectable for tests
- `index.ts` — `runEtch()`, the agent's entry point
- `cli.ts` — CLI wrapper (`npm run etch`)
