import { runLedger } from "./index.ts";

try {
  const status = runLedger();
  console.log(`Ledger: wrote status for ${status.summary.totalBatches} batch(es)`);
  if (status.summary.invalidBatchCount > 0) {
    console.log(`  ${status.summary.invalidBatchCount} invalid batch folder(s):`);
    for (const b of status.invalidBatches) {
      console.log(`    - ${b.batchId}: ${b.error}`);
    }
  }
  console.log("  dashboard/public/status.json");
} catch (err) {
  console.error("Ledger failed:", err instanceof Error ? err.message : err);
  process.exit(1);
}
