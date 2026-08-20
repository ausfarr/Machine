# Workflows

No workflow here ever auto-merges or auto-publishes. Every automated code
change lands as a pull request for a human to review; publishing to KDP
happens entirely outside this repo, by hand.

## `pipeline.yml` — weekly, or manual

Runs weekly (Monday 13:00 UTC) and on `workflow_dispatch`. Runs the whole
pipeline unattended, end to end: Opportunity Scanner first picks this
week's KDP category (Claude + web_search), logging every candidate
considered — including the ones passed over — in
`agents/opportunity-scanner/reports/`. Scout then proposes fresh candidate
themes itself via the Anthropic API within that category (avoiding themes
already produced), blends them with anything queued by hand in
`theme-queue.json` at the repo root, picks one, and researches it.
`theme-queue.json` is optional — it's a way to make sure a specific idea
gets considered, not a required gate; this workflow produces a batch every
time it runs, queue or no queue.

From there the pipeline branches on the category's content type:

- **Illustrated** — Loom writes prompts, Etch generates the images via the
  Gemini API, and Bindery + Crier assemble the interior PDF and listing.
  The PR is ready for a human to proof `interior.pdf`, `cover-art.png`,
  and `listing.json`.
- **Text-only** — Writer generates the full manuscript via the Anthropic
  API, and Bindery typesets it into a print-ready interior PDF. Crier
  doesn't support text-only categories yet (see
  `agents/crier/README.md`'s "Known v2 gap"), so the batch stops at stage
  `assembled` — no `listing.json` yet. The PR body surfaces a
  representative excerpt from the manuscript and flags that it warrants a
  closer read than an illustrated batch, since there's no human-curated
  illustration step in between (see CLAUDE.md's Writer section).

Opens one PR with the whole batch for a human to review before merging,
either way.

Requires the `ANTHROPIC_API_KEY` and `GEMINI_API_KEY` repo secrets — see
CLAUDE.md's "Authorized external APIs" section for what each is scoped to.
A text-only run never actually calls the Gemini API (there's nothing for
Etch to do), but the secret is passed unconditionally either way — it's
simply unused on that path.

## `bindery-crier.yml` — on new/changed images

Triggers on a push to `main` that touches `batches/*/images/**`. Detects
which batch(es) changed, then for each one runs Bindery (validates and
assembles the interior PDF) and Crier (drafts listing copy), opening a PR
with the results for human review. This is the escape hatch for a human
who wants to hand-supply images instead of Etch, or replace Etch's output
for a batch they didn't like — Bindery accepts either stage `prompted`
(images supplied by hand) or `imaged` (Etch already ran). A batch whose
images fail Bindery's validation just fails that job — push the corrected
images to retrigger.

## `deploy-dashboard.yml` — on batch/dashboard changes

Triggers on a push to `main` touching batch manifests, the dashboard, or
Ledger itself. Runs Ledger to regenerate `dashboard/public/status.json`
from main's current state, builds the dashboard, and deploys it to
GitHub Pages. This deploys the pipeline's own status page — it never
touches KDP or publishes book content anywhere.

## `ci.yml` — every PR and push to main

Runs the root test suite (`npm run typecheck && npm test`) and the
dashboard's build, so a broken change can't merge silently.

## `sentinel.yml` — when CI fails on a push to main

Triggers when `ci.yml` completes with `conclusion: failure` on a push to
main (not on PRs — Sentinel reacts to the mainline breaking, not to
work-in-progress branches). Re-runs typecheck/test to capture the actual
failure output, then runs Sentinel, which diagnoses it via the Anthropic
API and — only when confident — proposes a minimal patch. The diagnosis
and (if produced) patch are always uploaded as a workflow artifact; a PR
only gets opened when Sentinel actually applied a patch, per CLAUDE.md's
Sentinel section. Never merges anything itself.
