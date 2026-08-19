# Bindery

Interior assembly. Takes a batch's final images — from Etch, a human, or
a human replacing Etch's output — and produces a print-ready interior PDF.

## Usage

```
npm run bindery -- <batch-id>
```

Requires the batch's `manifest.json` to be at stage `prompted` (Loom has
run; a human is supplying/replacing images by hand) or `imaged` (Etch has
already generated them), with images present in
`batches/{batch-id}/images/`, named with a leading page number matching
each prompt's index (`01.png`, `02.png`, ... — `.jpg`/`.jpeg` also
accepted). Bindery re-validates the images on disk itself either way —
it never trusts a prior stage's manifest entry over what's actually
there. The resulting manifest's `images.source` records whether Etch or a
human produced the final set.

## Validation (fails loudly, never assembles a broken file)

- Image count must exactly match Loom's `promptCount`.
- Page numbers must run 1..N with no gaps or duplicates — this is the
  "page order" check.
- Every image must be a readable PNG or JPEG at or above 2550x3300px
  (8.5x11in at 300 DPI), KDP's minimum recommended resolution.

Any failure throws a specific, actionable error instead of producing a
partial or malformed PDF.

## PDF spec (`kdpSpecs.ts`)

- Trim size: 8.5x11in, no bleed (default for a black-and-white,
  low-content interior).
- Margins: 0.5in outer/top/bottom; inside (gutter) margin scales with
  page count per KDP's published minimums, alternating sides so the
  gutter always faces the spine (odd pages = recto, gutter on the left;
  even pages = verso, gutter on the right).
- Each image is scaled to fit its page's content box (preserving aspect
  ratio) and centered.
- Before embedding, each image is re-encoded as grayscale, palette-quantized
  PNG at max compression (`assemble.ts`'s `recompressForPrint`). The interior
  is black-and-white line art per spec, but raw Etch/Gemini output (and most
  human-supplied scans) is full-RGB with generation noise that otherwise
  balloons a 20-30 page `interior.pdf` past GitHub's 100MB single-file limit.

These margin numbers are a reasonable default, not a guarantee — reconfirm
against KDP's current spec sheet before publishing, since Amazon can
revise these.

## Files

- `kdpSpecs.ts` — trim size, margin, and resolution constants
- `validateImages.ts` — image count/order/resolution validation
- `assemble.ts` — PDF layout (pdf-lib)
- `index.ts` — `runBindery()`, the agent's entry point
- `cli.ts` — CLI wrapper (`npm run bindery`)
