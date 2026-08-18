import { runBindery } from "./index.ts";

const batchId = process.argv[2];

if (!batchId) {
  console.error("usage: npm run bindery -- <batch-id>");
  process.exit(1);
}

runBindery(batchId)
  .then((result) => {
    console.log(`Bindery: batch "${batchId}" moved to stage "assembled"`);
    console.log(`  ${result.interiorPdfPath} (${result.pageCount} pages)`);
    console.log(`  ${result.batchDir}/manifest.json`);
  })
  .catch((err) => {
    console.error("Bindery failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
