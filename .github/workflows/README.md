# Workflows

No workflow here ever auto-merges or auto-publishes. Every automated code
change lands as a pull request for a human to review; publishing to KDP
happens entirely outside this repo, by hand.

## `scout-loom.yml` — weekly, or manual

Runs weekly (Monday 13:00 UTC) and on `workflow_dispatch`. Pops the next
theme off `theme-queue.json` (repo root) and runs Scout then Loom on it —
adding a theme to that file is the human approval this pipeline requires
before Loom runs. Opens a PR with the new `batches/{id}/` folder for a
human to review before merging. If the queue is empty, it's a no-op.

## `bindery-crier.yml` — on new images

Triggers on a push to `main` that touches `batches/*/images/**`. Detects
which batch(es) changed, then for each one runs Bindery (validates and
assembles the interior PDF) and Crier (drafts listing copy), opening a PR
with the results for human review. A batch whose images fail Bindery's
validation just fails that job — push the corrected images to retrigger.

## `deploy-dashboard.yml` — on batch/dashboard changes

Triggers on a push to `main` touching batch manifests, the dashboard, or
Ledger itself. Runs Ledger to regenerate `dashboard/public/status.json`
from main's current state, builds the dashboard, and deploys it to
GitHub Pages. This deploys the pipeline's own status page — it never
touches KDP or publishes book content anywhere.

## `ci.yml` — every PR and push to main

Runs the root test suite (`npm run typecheck && npm test`) and the
dashboard's build, so a broken change can't merge silently.
