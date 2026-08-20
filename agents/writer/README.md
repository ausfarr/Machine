# Writer

Full manuscript generation for text-only KDP categories — poetry
collections, short fiction, journals with written prompts, and similar
formats where there's no illustration to generate. Sits alongside Loom +
Etch as the other branch of the pipeline: Opportunity Scanner/Scout route
an illustrated category to Loom+Etch, and a text-only category to Writer
instead (see CLAUDE.md's data flow).

## Usage

```
npm run writer -- <batch-id>
```

Requires the batch's `manifest.json` to be at stage `researched` with
`opportunityScanner.contentType === "text"` (i.e. Opportunity Scanner
picked a text-only category and Scout has already researched a theme
within it). Writes `manuscript.json` and `manuscript.md`, and updates
`manifest.json` to stage `manuscripted`.

A batch stays at `manuscripted` until Bindery's manuscript-typesetting
assembly mode runs on it (see CLAUDE.md's Bindery section and "Build
order" v2 phase) — same as an illustrated batch waits at `imaged` for
Bindery's image-grid mode.

## Requires `ANTHROPIC_API_KEY`

Writer calls the Anthropic API — the fourth and last currently-authorized
use of that key, per CLAUDE.md's "Authorized external APIs" section. One
call, using Claude's structured tool-use output, generates the full
manuscript: every section's complete text (never a summary or
placeholder) plus draft front/back matter appropriate to the category.
`MANUSCRIPT_SECTION_COUNT` in the root `config.ts` sets how many sections
per manuscript (default 15) — sized to fit one non-streaming API call.

## The PR-visibility flag

Per CLAUDE.md's Writer section, this isn't a separate approval gate — it's
the same pull request every other agent's output goes through — but a
Writer-sourced batch is flagged more visibly, since it's fully
AI-generated prose rather than curated illustrations:

- `manifest.writer.excerpt` — a representative excerpt (first section,
  truncated to ~280 characters at a word boundary)
- `manifest.writer.proofreadRecommended` — always `true` when Writer ran

Not yet wired into `.github/workflows/pipeline.yml`'s PR body — that
lands once the workflow is updated for the full v2 flow (see CLAUDE.md's
"Build order").

## Files

- `claudeClient.ts` — the Anthropic API wrapper (`generateManuscript`), dependency-injectable for tests
- `index.ts` — `runWriter()`, the agent's entry point
- `cli.ts` — CLI wrapper (`npm run writer`)
