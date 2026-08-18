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

## Dashboard fields (agents / activity)

Two additional fields exist purely to feed the dashboard's agent-roster
grid and activity feed — both computed from the same validated batch
manifests, never a separate source of truth:

- `agents`: one entry per real agent module from CLAUDE.md's Agents
  section (including Sentinel and Analyst, which aren't built yet — see
  "Build order"). Each entry has a `status` (`active` / `idle` /
  `not_yet_run`), the real `lastRanAt` timestamp behind that status, and
  one real computed `metric`. Sentinel and Analyst have no producer yet,
  so they honestly report `not_yet_run` and a `0` metric until they exist
  and write real data somewhere Ledger can read.
- `activity`: every batch's real per-stage timestamps, flattened into a
  single chronological feed (newest first). PR-opened and CI-result
  events aren't included yet — no agent or workflow writes that data
  anywhere Ledger can read (Sentinel and the step-7 GitHub Actions
  workflows don't exist yet). Add them once something produces a real,
  readable record; never fabricate one to fill in the feed.

`agents[].status` uses one documented heuristic on real timestamps, not a
live signal: a stage counts as `active` if its most recent real timestamp
is within 8 days of Ledger's run (the pipeline's weekly cadence plus a
1-day buffer), `idle` if it has run before but not that recently, and
`not_yet_run` if it has never produced a record at all.

## Guardrails

- Never invents a number. Zero batches means the status file honestly
  says zero, not a placeholder count.
- A batch whose `manifest.json` fails schema validation is reported under
  `invalidBatches` with the real validation error — never silently
  dropped, never guessed at.
- A batch folder with no `manifest.json` at all is reported the same way.
- Every `agents[]` metric and every `activity[]` event traces back to a
  field already present on a validated manifest — nothing is fabricated
  to fill a gap, including for agents (Sentinel, Analyst) that don't
  exist yet.

## Files

- `index.ts` — `runLedger()`, the agent's entry point
- `cli.ts` — CLI wrapper (`npm run ledger`)
