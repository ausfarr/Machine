import { runWriter } from "./index.ts";

const batchId = process.argv[2];

if (!batchId) {
  console.error("usage: npm run writer -- <batch-id>");
  process.exit(1);
}

try {
  const result = await runWriter(batchId);
  console.log(`Writer: batch "${batchId}" moved to stage "${result.manifest.stage}"`);
  console.log(`  ${result.manuscriptJsonPath}`);
  console.log(`  ${result.manuscriptMdPath}`);
} catch (err) {
  console.error("Writer failed:", err instanceof Error ? err.message : err);
  process.exit(1);
}
