import { appendFileSync } from "node:fs";
import { runPipelineFromQueue } from "./queue.ts";

try {
  const result = await runPipelineFromQueue();

  if (!result.processed) {
    console.log("Theme queue is empty — nothing to run this pipeline pass.");
    process.exit(0);
  }

  console.log(`Pipeline: batch "${result.batchId}" for "${result.theme}" is now at stage "${result.stage}".`);
  console.log(`Selection rationale: ${result.selectionRationale}`);
  console.log(`${result.remainingQueueLength} theme(s) remaining in the queue.`);

  if (process.env.GITHUB_OUTPUT) {
    const delimiter = `queue_theme_${Date.now()}`;
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `batch_id=${result.batchId}\ntheme<<${delimiter}\n${result.theme}\n${delimiter}\n`
    );
  }
} catch (err) {
  console.error("Pipeline run failed:", err instanceof Error ? err.message : err);
  process.exit(1);
}
