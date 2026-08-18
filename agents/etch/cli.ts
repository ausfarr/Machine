import { runEtch } from "./index.ts";

const batchId = process.argv[2];

if (!batchId) {
  console.error("usage: npm run etch -- <batch-id>");
  process.exit(1);
}

try {
  const result = await runEtch(batchId);
  console.log(`Etch: generated ${result.count} image(s) for batch "${batchId}" at stage "imaged"`);
  console.log(`  ${result.imagesDir}`);
} catch (err) {
  console.error("Etch failed:", err instanceof Error ? err.message : err);
  process.exit(1);
}
