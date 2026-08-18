# Workflows

No workflow here ever auto-merges or auto-publishes. Every automated code
change lands as a pull request for a human to review; publishing to KDP
happens entirely outside this repo, by hand.

## `pipeline.yml` — weekly, or manual

Runs weekly (Monday 13:00 UTC) and on `workflow_dispatch`. Runs the whole
pipeline unattended on one theme from `theme-queue.json` (repo root):
Scout picks and researches the theme via the Anthropic API, Loom writes
prompts, Etch generates the images via the Gemini API, then Bindery
assembles the interior PDF and Crier drafts the listing. Adding a theme
to the queue is what makes it eligible — Scout still has to select it
before anything runs. Opens one PR with the whole batch for a human to
review before merging. If the queue is empty, it's a no-op.

Requires the `ANTHROPIC_API_KEY` and `GEMINI_API_KEY` repo secrets — see
CLAUDE.md's "Authorized external APIs" section for what each is scoped to.

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
