import { appendFileSync } from "node:fs";
import { processNextQueuedTheme } from "./queue.ts";

try {
  const result = processNextQueuedTheme();

  if (!result.processed) {
    console.log("Theme queue is empty — nothing to research this run.");
    process.exit(0);
  }

  console.log(`Scout+Loom: batch "${result.batchId}" for "${result.theme}" is now at stage "${result.stage}".`);
  console.log(`${result.remainingQueueLength} theme(s) remaining in the queue.`);

  if (process.env.GITHUB_OUTPUT) {
    const delimiter = `queue_theme_${Date.now()}`;
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `batch_id=${result.batchId}\ntheme<<${delimiter}\n${result.theme}\n${delimiter}\n`
    );
  }
} catch (err) {
  console.error("Queue processing failed:", err instanceof Error ? err.message : err);
  process.exit(1);
}
