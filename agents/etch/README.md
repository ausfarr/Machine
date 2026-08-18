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

## Which API call, and why

Etch calls Gemini's dedicated **Imagen** image-generation endpoint
(`models.generateImages`, default model `imagen-3.0-generate-002`), not
the general-purpose multimodal chat endpoint (`models.generateContent`,
the model behind e.g. `gemini-2.5-flash-image`). A chat-style model is
free to respond with text instead of an image — in practice it
occasionally just describes the image in prose ("Here are your whimsical
cottagecore mushroom cottages...") rather than drawing it, which reads to
Etch as "no image data" for no diagnosable reason. `generateImages`'s
response type has no text field at all, so that failure mode is
structurally impossible here, not just less likely. Override the model
via `GEMINI_MODEL` if a newer Imagen version becomes available.

If any single image fails to generate, Etch throws immediately and leaves
the manifest at stage `prompted` rather than claiming the batch reached
`imaged` with missing or placeholder pages — per the "fail loudly" and "no
fabricated data" guardrails. Two distinct kinds of failure are handled
differently:

- **A response with no image, but a diagnosable reason** — Imagen's own
  responsible-AI filter (`raiFilteredReason`) declining the prompt, most
  often because it describes something sensitive (e.g. a theme phrased
  around a vulnerable population, like "for anxious kids"). Not retried,
  since asking again with the identical prompt won't change the outcome;
  the thrown error includes the diagnostic so the prompt can be reworded.
- **An HTTP-level failure from the API call itself** (a 5xx server error
  or a 429 rate limit — e.g. "got status: 503 ... Deadline expired before
  operation could complete") — retried up to 3 attempts total with
  backoff, since these are transient. A 4xx client error (bad request,
  auth failure) is not retried, since it would fail identically every
  time.

Either way, once retries are exhausted the thrown error names the actual
cause. Re-run Etch once the underlying problem (a prompt that needs
rewording, an API outage that's since cleared, etc.) is resolved.

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
