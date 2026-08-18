import { runCrier } from "./index.ts";

const batchId = process.argv[2];

if (!batchId) {
  console.error("usage: npm run crier -- <batch-id>");
  process.exit(1);
}

try {
  const result = runCrier(batchId);
  console.log(`Crier: batch "${batchId}" moved to stage "listed"`);
  console.log(`  ${result.listingPath}`);
  console.log(`  ${result.batchDir}/manifest.json`);
  console.log("Next: a human proofs the listing, discloses AI-generated content, and publishes to KDP.");
} catch (err) {
  console.error("Crier failed:", err instanceof Error ? err.message : err);
  process.exit(1);
}
