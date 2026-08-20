import { appendFileSync } from "node:fs";
import { buildPrBody } from "./prBody.ts";
import { runPipelineFromQueue } from "./queue.ts";

try {
  const result = await runPipelineFromQueue();

  console.log(`Pipeline: batch "${result.batchId}" for "${result.theme}" (category: "${result.category}", ${result.contentType}) is now at stage "${result.stage}".`);
  console.log(`Selection rationale: ${result.selectionRationale}`);
  console.log(`${result.remainingQueueLength} human-suggested theme(s) remaining in theme-queue.json.`);

  if (process.env.GITHUB_OUTPUT) {
    const themeDelimiter = `queue_theme_${Date.now()}`;
    const categoryDelimiter = `queue_category_${Date.now()}`;
    const prBodyDelimiter = `queue_pr_body_${Date.now()}`;
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      [
        `batch_id=${result.batchId}`,
        `content_type=${result.contentType}`,
        `theme<<${themeDelimiter}`,
        result.theme,
        themeDelimiter,
        `category<<${categoryDelimiter}`,
        result.category,
        categoryDelimiter,
        `pr_body<<${prBodyDelimiter}`,
        buildPrBody(result),
        prBodyDelimiter,
        "",
      ].join("\n")
    );
  }
} catch (err) {
  console.error("Pipeline run failed:", err instanceof Error ? err.message : err);
  process.exit(1);
}
