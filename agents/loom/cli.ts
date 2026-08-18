import { runLoom } from "./index.ts";

const batchId = process.argv[2];

if (!batchId) {
  console.error("usage: npm run loom -- <batch-id>");
  process.exit(1);
}

try {
  const result = runLoom(batchId);
  console.log(`Loom: batch "${batchId}" moved to stage "prompted"`);
  console.log(`  ${result.promptsPath}`);
  console.log(`  ${result.frontBackMatterPath}`);
  console.log(`  ${result.batchDir}/manifest.json`);
  console.log("Next: generate images from these prompts in an external tool and drop them into the batch's images/ folder.");
} catch (err) {
  console.error("Loom failed:", err instanceof Error ? err.message : err);
  process.exit(1);
}
