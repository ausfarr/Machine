# Coloring Book Pipeline — Project Brief

## What this is

An AI-assisted content pipeline for publishing books to Amazon KDP — coloring books plus, as of v2, any other KDP category Opportunity Scanner selects (children's books, poetry collections, short fiction, and other low-content or text-only formats). This repo owns everything from category and niche research through print-ready file generation and listing copy. It does not publish anything automatically — every batch ends in a pull request for human review.

## Explicit scope (v1)

**In scope:**
- Any KDP book category, chosen weekly by Opportunity Scanner — coloring books, children's books, poetry collections, short fiction, and other low-content or text-only formats, all sold via Amazon KDP
- Niche/keyword research and automated theme selection, using the Anthropic API (see "Authorized external APIs" below)
- Prompt generation, and automated image generation from those prompts using the Gemini API (see below)
- Interior PDF assembly from the resulting images
- Listing metadata generation (title, keywords, categories, description)
- A dashboard showing real pipeline status
- Cosmetic agent personas (name/portrait/tagline) on the dashboard —
  presentation only, must never be the source of a displayed number;
  all numbers still come from Ledger's real run data.

**Explicitly out of scope for v1 — do not build:**
- General print-on-demand / Etsy / Shopify integration
- Any trading, market-signal, or financial automation
- Auto-publishing to Amazon or any platform
- Any fabricated or placeholder metrics on the dashboard — it only ever shows real data pulled from this repo's own run history

## Authorized external APIs

Per the "no agent calls an external paid API without that being explicitly
stated in this file first" guardrail, exactly three paid API authorizations
exist, each scoped to one agent (two distinct keys — Sentinel reuses Scout's
`ANTHROPIC_API_KEY`):

- **Anthropic API (Claude)** — used by **Scout** to research candidate
  themes and to select which queued theme to pursue next. This replaces the
  human "greenlight a theme" checkpoint that earlier versions of this
  pipeline had: Scout's theme choice is now the automated decision, not a
  human one. Requires `ANTHROPIC_API_KEY`.
- **Gemini API** — used by **Etch** (see below) to generate the actual
  interior images from Loom's prompts, plus one front-cover art image per
  batch. This replaces the earlier human-runs-an-external-tool-by-hand step.
  Requires `GEMINI_API_KEY`.
- **Anthropic API (Claude)** — used by **Sentinel** to diagnose CI/test
  failures and draft fix PRs against this repo. Scoped to this repo's own
  code and workflows only; never touches batch data, KDP, or any external
  account. Every fix is a PR, never an auto-merge. Requires the same
  `ANTHROPIC_API_KEY` already used by Scout.
- **Anthropic API (Claude), with `web_search` tool enabled** — used by
  **Opportunity Scanner** to identify the best KDP category to pursue this
  week, grounded in live listing/trend signal pulled via the API's native
  web search tool (not custom scraping). Requires `ANTHROPIC_API_KEY`
  (reuses the existing key).
- **Anthropic API (Claude), with `web_search` tool enabled** — used by
  **Scout**, upgrading its existing theme-selection call from pure
  LLM-estimate to search-grounded research. Same key, `web_search` added
  to its existing authorized call.
- **Anthropic API (Claude)** — used by **Writer** to generate full
  manuscript text for text-only categories. Requires `ANTHROPIC_API_KEY`
  (reuses the existing key). This is the fourth authorized use of that
  key.

Every research report and generated image is labeled as AI-produced in the
batch manifest — this repo never obscures which parts of a batch were
machine-generated, including to itself. No other agent calls an external
paid API. Adding one to another agent requires updating this section first.

## Agents (modules)

Each agent is a self-contained script with one job.

### Opportunity Scanner — weekly category selection
- Input: live KDP marketplace signal via the Claude API's web_search tool
  (category browsing, bestseller/review-count signal, trend signal), plus
  this repo's own batch history (to avoid repeating a recently-chosen
  category without cause)
- Output: one selected category/format for the week (`.json` + `.md`),
  plus rationale, plus the other candidates considered and why they were
  passed over — logged for audit, same disclosure pattern Scout already
  uses
- Picks exactly one category, not a shortlist, so the pipeline stays fully
  unattended end-to-end — consistent with the existing "Scout's theme
  choice is automated, not a human gate" design. The report discloses
  that even with live search data behind it, this is still an automated
  estimate of demand, not certainty.

### Scout — niche & keyword research + theme selection
- Input: candidate themes Scout proposes itself via the Anthropic API, blended with any human-suggested entries in `theme-queue.json` (optional — a way to make sure a specific idea gets considered, not a required gate)
- Output: a research report (`.json` + `.md`) on the theme it selects — competition assessment, suggested angle, keyword variants — plus the Claude-generated rationale for why that theme was chosen over the other candidates
- Uses the Anthropic API to generate candidates, analyze them, and pick one; this is an automated decision end to end, not a human one. The report explicitly discloses it's an LLM's estimate, not live Amazon/Google search-volume data. Candidate generation avoids repeating themes already produced by an existing batch.
- Operates within the category Opportunity Scanner selected that week, rather than defaulting to coloring books.
- Uses the Claude API's `web_search` tool for live listing/trend data alongside its existing reasoning; the report discloses which parts are live data and which are model reasoning.

### Loom — prompt generation
- Input: the theme Scout selected
- Output: a batch of 20–30 image prompts (`.json`), formatted for Etch (and still usable by hand in an external tool if a human wants to bypass Etch), plus draft front/back matter text and one front-cover art prompt — the cover prompt embeds the same title Crier independently builds for `listing.json`, and asks the image model to render that title as part of the illustration itself
- Does not call any image generation API itself — it only writes prompts. Etch is the agent that turns them into images.
- Prompt style is category-aware (coloring-book page prompts vs. picture-book illustration prompts vs. cover art for any illustrated format). Still writes standalone `prompts.json`, still usable by hand if a human wants to bypass Etch.

### Etch — image generation
- Input: `prompts.json` from an approved (`prompted`-stage) batch
- Output: one generated image per prompt in `/batches/{batch-id}/images/`, plus one front-cover art image (title included) at `/batches/{batch-id}/cover-art.png`, meeting Bindery's minimum resolution for print
- Calls the Gemini API per the authorization above. Fails loudly and leaves the manifest at its prior stage if any image (interior page or cover art) fails to generate, rather than assembling a batch with missing or placeholder pages. A human can still hand-supply or replace images in this folder, or `cover-art.png`, instead of/in addition to running Etch — Bindery accepts either. A standalone `npm run generate:cover -- <batch-id>` script (`scripts/generate-cover-for-batch.ts`) can also generate just the cover art for a batch that doesn't have one yet, without re-running the rest of the pipeline.
- Generic image executor for any illustrated category selected by Opportunity Scanner/Scout — no coloring-book-specific logic.

### Writer — full manuscript generation for text-only categories
- Input: the theme/niche Scout selected, for any category that's
  text-only (no illustration needed) — poetry collections, short fiction,
  journals with written prompts, etc.
- Output: full manuscript text (`.md`/`.json`), flagged as AI-generated in
  the batch manifest, same disclosure rule as Loom/Etch/Crier output
- Uses the Anthropic API to generate the manuscript — the fourth and last
  currently-authorized use of that key; see "Authorized external APIs"
  above, added before this agent was built, not after.
- Batches sourced from Writer carry an extra manifest field surfaced in
  the PR: a representative excerpt plus a flag noting the content is
  fully AI-generated text and warrants a closer read than an illustrated
  batch. Not a separate approval gate — same PR, more visible.

### Bindery — interior assembly
- Input: a folder of final images (`/batches/{batch-id}/images/`) — from Etch, a human, or both
- Output: a print-ready interior PDF meeting KDP's trim size, margin, and bleed specs (8.5x11 default)
- Validates image count, resolution, and page order before assembling; fails loudly if anything's missing rather than silently producing a broken file
- Gains a second assembly mode — manuscript typesetting (chapters, front/back matter, running heads, widow/orphan handling) — for Writer-sourced batches, alongside the existing image-grid interior assembly for illustrated batches. Validates against whichever mode the batch's content type calls for; fails loudly if the wrong assets are present for the selected mode.

### Crier — listing metadata
- Input: the approved batch (theme, title candidates, front/back matter)
- Output: KDP-ready title, subtitle, 7 keyword slots, category suggestions, description
- Flags all output as AI-generated content in the batch manifest, for KDP's disclosure step — this repo never obscures that

### Ledger — status & dashboard data
- Reads run logs and batch manifests across the repo
- Outputs the data file the dashboard renders
- Never invents numbers. If something hasn't run yet, it shows "not yet run," not a placeholder figure.

### Sentinel — repo self-improvement & ops
- Input: CI run results, test failures, dependency audit output from this repo
- Output: a diagnosis of what broke or drifted, plus a draft fix (PR) —
  never auto-merged — and one real entry appended to
  `agents/sentinel/run-log.json` per attempted run (whether or not a
  confident fix resulted), which Ledger reads for its real dashboard
  status/metric
- Uses the Anthropic API to analyze failures and draft fixes. This is the
  third and last authorized use of that key — see "Authorized external
  APIs" above; add it there before building this agent, not after.
- Scope: this repo only. It does not touch KDP, batches, or any external
  account. If a fix is wrong, a human catches it in PR review like every
  other agent's output.

### Analyst — marketing & sales analytics
- Input: KDP sales/royalty report exports, uploaded by a human once a
  book is actually published (no live KDP API integration in v1 — KDP
  doesn't offer one suited to this)
- Output: real performance data (units, royalties, keyword performance)
  surfaced on the dashboard
- Until a human uploads a real export, this agent has nothing to report.
  The dashboard must show an honest "not yet published" / zero state,
  never a placeholder number, per the no-fabricated-data guardrail.

## Data flow

```
Opportunity Scanner (Claude API + web_search: picks ONE best KDP category
this week; logs alternatives considered and why they were passed over)
  → Scout (Claude API + web_search: picks specific theme/niche within
    that category)
  → branch on the category's content type:
      - Illustrated → Loom (prompts) → Etch (Gemini: images)
      - Text-only    → Writer (Claude API: full manuscript)
  → Bindery (image-grid mode OR manuscript-typesetting mode) → interior PDF
  → Crier → listing copy
  → PR opened for human review
    (Writer-sourced batches: excerpt + proofread flag included in the PR)
  → [human: proof, disclose, publish]
```

The whole chain from category selection through listing copy runs
unattended in one pipeline run. The only remaining human checkpoint is the
PR at the end — proofing the interior PDF (or manuscript) and listing
copy, disclosing AI-generated content per KDP's rules, and publishing
externally. Nothing in this repo merges its own PRs or publishes to KDP.

A human can still intervene mid-pipeline at any point — e.g. edit
`prompts.json` before Etch runs, or replace files in a batch's `images/`
folder before Bindery runs — every agent re-validates its own inputs
rather than trusting that an earlier automated step got it right.

Each batch lives in `/batches/{batch-id}/` with a `manifest.json` tracking its stage: `researched` → `prompted` → `imaged` → `assembled` → `listed` → `published`.

## Tech stack

- **Language:** TypeScript / Node.js
- **Category selection + research + theme selection:** Anthropic API, with `web_search` (Opportunity Scanner and Scout — see "Authorized external APIs")
- **Manuscript generation:** Anthropic API (Writer only — see "Authorized external APIs")
- **Image generation:** Gemini API (Etch only — see "Authorized external APIs")
- **PDF assembly:** `pdf-lib`
- **Image handling:** `sharp`
- **Dashboard:** React + Vite + Tailwind, static build deployed via GitHub Pages
- **Automation:** GitHub Actions
  - Scheduled pipeline workflow runs Opportunity Scanner → Scout → (Loom → Etch, or Writer, depending on category content type) → Bindery → Crier → Ledger weekly, end to end, and opens one PR with the whole batch for human review
  - A separate workflow triggers on new/changed images landing in a batch folder (e.g. a human replacing Etch's output by hand) and re-runs Bindery + Crier, opening a PR
  - No workflow ever auto-merges or auto-publishes

## Folder structure

```
/agents
  /opportunity-scanner
  /scout
  /loom
  /etch
  /writer
  /bindery
  /crier
  /ledger
/batches
  /{batch-id}/
    manifest.json
    research.md
    prompts.json     (illustrated categories)
    manuscript.md     (text-only categories, Writer-sourced)
    images/        (Etch-generated, or human-supplied/edited)
    cover-art.png  (Etch-generated, or human-supplied/edited)
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
8. Etch (image generation) + full pipeline automation

v2 phase (multi-category expansion):
9. Opportunity Scanner
10. Generalize Loom + Etch for multi-category illustrated support
11. Writer
12. Bindery manuscript-typesetting mode
13. Update the GitHub Actions workflow: Opportunity Scanner → Scout →
    branch (illustrated/text) → assemble → PR

Do not build the dashboard before agents 2–5 exist — it needs real data to render against.

## Guardrails

- No fabricated data anywhere, including in placeholder/demo states
- No agent calls an external paid API without that being explicitly stated in this file's "Authorized external APIs" section
- No agent auto-publishes, auto-purchases (beyond the three authorized per-call API costs above), or takes any irreversible action
- If a step's output looks wrong, fail with a clear error rather than proceeding with bad data
- Every report or asset produced by an authorized API call is labeled as AI-generated in the manifest — never presented as human-authored or as real market data
