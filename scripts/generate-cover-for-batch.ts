import { runCoverBackfill } from "./coverBackfill.ts";

const batchId = process.argv[2];

if (!batchId) {
  console.error("usage: npm run generate:cover -- <batch-id>");
  process.exit(1);
}

try {
  const result = await runCoverBackfill(batchId);
  console.log(`Cover art generated for batch "${batchId}":`);
  console.log(`  ${result.coverArtPath}`);
} catch (err) {
  console.error("Cover generation failed:", err instanceof Error ? err.message : err);
  process.exit(1);
}
