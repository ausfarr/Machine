# Ledger

Status aggregation. Reads every batch's `manifest.json` and writes the
data file the dashboard renders.

## Usage

```
npm run ledger
```

Writes `dashboard/public/status.json`. Run this after any pipeline
activity to refresh the dashboard's data (the step-7 GitHub Actions
workflow will do this automatically).

## What counts as "run history" in v1

CLAUDE.md describes Ledger as reading "run logs and batch manifests," but
no agent in this pipeline writes a separate run-log file yet — each
batch's `manifest.json` (with its per-stage `completedAt` timestamps) is
the only durable run-history record that exists. So that's what Ledger
reads. If a dedicated run-log format gets added later, Ledger should read
that too.

## Guardrails

- Never invents a number. Zero batches means the status file honestly
  says zero, not a placeholder count.
- A batch whose `manifest.json` fails schema validation is reported under
  `invalidBatches` with the real validation error — never silently
  dropped, never guessed at.
- A batch folder with no `manifest.json` at all is reported the same way.

## Files

- `index.ts` — `runLedger()`, the agent's entry point
- `cli.ts` — CLI wrapper (`npm run ledger`)
