# Sentinel

Repo self-improvement & ops. Reads a CI failure log, diagnoses it via the
Anthropic API, and — only when confident — applies a minimal patch to the
working tree. Never commits, never opens a PR, and never merges anything
itself; the `sentinel.yml` workflow does the commit/PR, and a human
reviews it like every other agent's output.

## Usage

```
npm run sentinel -- <path-to-failure-log>
```

Reads the log file, pulls out the source files it references (tsc-style
`file(line,col)` and Node/Vitest stack-trace `file:line:col` paths, capped
at 5 files that actually exist in the repo), and sends the log plus those
files to Claude. Writes `sentinel-report.md` at the repo root — the
diagnosis is written *before* any patch-apply attempt, so it survives a
patch that fails to apply. Exit codes: `0` = patch applied, `1` = a real
failure (missing `ANTHROPIC_API_KEY`, a malformed API response, a patch
that didn't apply), `2` = ran fine but Claude wasn't confident enough to
propose a fix — a legitimate, honest outcome, not an error.

## Requires `ANTHROPIC_API_KEY`

The third and last authorized use of this key (see CLAUDE.md's
"Authorized external APIs" section) — the same key Scout uses. Sentinel
never touches KDP, batch data, or any external account; its blast radius
is this repo's own code and config.

## Why a patch can fail to apply

Claude's proposed unified diff is generated from the files Sentinel gave
it, which is necessarily a partial view of the repo (whatever the failure
log pointed to, capped at 5 files). If line numbers drift or the real fix
needs a file that wasn't included, `git apply` rejects the patch and
Sentinel throws loudly — per the "fail loudly, no fabricated fix"
guardrail — rather than force-applying something that might silently
corrupt a file. The diagnosis in `sentinel-report.md` is still useful to
a human even when this happens.

## What Sentinel does not do

- Does not decide it's "confident" by default — the tool schema requires
  Claude to explicitly set `confidentFix`, and a patch is only ever
  applied when it's `true`.
- Does not retry a failed patch apply with a different prompt — that's a
  human call, made in PR review.
- Does not touch anything under `/batches` — its diagnosis prompt only
  ever includes files a CI failure log actually pointed to, which in
  practice means this repo's own agent/schema/dashboard code, not batch
  content.

## Files

- `claudeClient.ts` — the Anthropic API wrapper (`diagnose`), dependency-injectable for tests
- `extractFiles.ts` — pulls real, existing repo file paths out of a raw failure log
- `index.ts` — `runSentinel()`, the agent's entry point
- `cli.ts` — CLI wrapper (`npm run sentinel`)
- `testFixtures.ts` — `fakeSentinelClient()` for tests that don't need a real API call
