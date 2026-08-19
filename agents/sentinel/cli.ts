import { appendFileSync, readFileSync } from "node:fs";
import { runSentinel } from "./index.ts";

const logPath = process.argv[2];
if (!logPath) {
  console.error("usage: npm run sentinel -- <path-to-failure-log>");
  process.exit(1);
}

try {
  const failureLog = readFileSync(logPath, "utf-8");
  const result = await runSentinel({ failureLog });

  console.log(`Sentinel: ${result.summary}`);
  console.log(`  confidentFix=${result.confidentFix} patchApplied=${result.patchApplied}`);
  console.log(`  ${result.reportPath}`);

  if (process.env.GITHUB_OUTPUT) {
    const delimiter = `sentinel_summary_${Date.now()}`;
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `patch_applied=${result.patchApplied}\nconfident_fix=${result.confidentFix}\nsummary<<${delimiter}\n${result.summary}\n${delimiter}\n`
    );
  }

  if (!result.patchApplied) {
    // Not an error — a diagnosis-only run is a legitimate, honest outcome — but
    // it means there's nothing to open a PR for, so signal that distinctly.
    process.exitCode = 2;
  }
} catch (err) {
  console.error("Sentinel failed:", err instanceof Error ? err.message : err);
  process.exit(1);
}
