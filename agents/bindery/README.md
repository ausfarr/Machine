# Bindery

Interior assembly, in one of two modes depending on the batch's content
type (see CLAUDE.md's Bindery section):

- **Image-grid** — illustrated batches. Takes a batch's final images —
  from Etch, a human, or a human replacing Etch's output — and lays out
  one per page.
- **Manuscript-typesetting** — Writer-sourced text-only batches. Flows
  real running text (word-wrap, chapters, front/back matter, running
  heads, widow/orphan control) into pages instead.

Both modes produce the same kind of output: a print-ready `interior.pdf`
and a `bindery` manifest block. `runBindery()` picks the mode from the
batch's stage — `manuscripted` always means manuscript mode; anything
else goes through the existing validation below and always means
image-grid mode. It never guesses from content alone.

## Usage

```
npm run bindery -- <batch-id>
```

### Image-grid mode

Requires the batch's `manifest.json` to be at stage `prompted` (Loom has
run; a human is supplying/replacing images by hand) or `imaged` (Etch has
already generated them), with images present in
`batches/{batch-id}/images/`, named with a leading page number matching
each prompt's index (`01.png`, `02.png`, ... — `.jpg`/`.jpeg` also
accepted). Bindery re-validates the images on disk itself either way —
it never trusts a prior stage's manifest entry over what's actually
there. The resulting manifest's `images.source` records whether Etch or a
human produced the final set.

### Manuscript-typesetting mode

Requires the batch's `manifest.json` to be at stage `manuscripted`
(Writer has run), with a readable `manuscript.json` at
`manifest.writer.manuscriptJsonPath`. Typesets front matter, one chapter
per Writer section, and back matter — each chapter starting on a fresh
page — into `interior.pdf`, using Times-Roman body text at 11pt with a
1.4x line height. See `typeset.ts` for the full layout algorithm.

**Gutter margin simplification:** a manuscript's final page count is only
known *after* flowing the text, but KDP's minimum gutter margin
(`gutterMarginIn()` in `kdpSpecs.ts`) scales with page count — a
chicken-and-egg problem the image-grid mode never hits, since its page
count equals the prompt count up front. Rather than flow the whole
manuscript twice, manuscript mode always uses the largest (safest) gutter
tier. This never violates KDP's minimum for any page count; a short
manuscript just ends up with a little more inner margin than it strictly
needs.

**Widow/orphan control:** when a paragraph must split across pages, a
lone first line is never stranded alone at the bottom of a page
(orphan), and a lone last line is never stranded alone at the top of the
next page (widow) — at least 2 lines move together in both cases. See
`paginateChapter()` in `typeset.ts`.

A manuscript-mode batch has no `loom`/`images`/`coverArt` at all — that's
expected, not a missing-data bug; `schemas/manifest.ts`'s stage
requirements branch on `opportunityScanner.contentType` precisely so a
real text-only batch doesn't get flagged as invalid for lacking
illustration fields it was never supposed to have.

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
- `validateImages.ts` — image count/order/resolution validation (image-grid mode)
- `assemble.ts` — image-grid PDF layout (pdf-lib)
- `typeset.ts` — manuscript-typesetting PDF layout: word-wrap, pagination with widow/orphan control, chapters, running heads, folios (pdf-lib)
- `index.ts` — `runBindery()`, the agent's entry point (picks a mode per batch)
- `cli.ts` — CLI wrapper (`npm run bindery`)
