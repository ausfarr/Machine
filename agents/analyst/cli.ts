import { readFileSync } from "node:fs";
import { runAnalyst } from "./index.ts";
import { runLedger } from "../ledger/index.ts";

const csvPath = process.argv[2];

if (!csvPath) {
  console.error("usage: npm run analyst -- path/to/report.csv");
  process.exit(1);
}

try {
  const csvText = readFileSync(csvPath, "utf-8");
  const result = runAnalyst(csvText);

  console.log(`Analyst: parsed ${result.totalRowCount} row(s) from ${csvPath}`);
  if (result.skippedRowCount > 0) {
    console.log(`  ${result.skippedRowCount} row(s) skipped — missing ASIN, units, royalty, or currency.`);
  }

  if (result.matched.length > 0) {
    console.log(`\nMatched ${result.matched.length} batch(es):`);
    for (const m of result.matched) {
      console.log(`  ${m.batchId} ("${m.theme}") — ${m.unitsSold} units, ${m.royaltyTotal.toFixed(2)} ${m.currency}`);
    }
  }

  if (result.ambiguous.length > 0) {
    console.log(`\n${result.ambiguous.length} ASIN(s) sold in more than one currency in this report — not auto-merged, needs a human look:`);
    for (const a of result.ambiguous) {
      console.log(`  ${a.asin}: ${a.currencies.join(", ")}`);
    }
  }

  if (result.unmatched.length > 0) {
    console.log(
      `\n${result.unmatched.length} row(s) had no matching batch — check they're published with the right ASIN set:`
    );
    for (const u of result.unmatched) {
      console.log(`  ASIN ${u.asin}: ${u.unitsSold} units, ${u.royaltyTotal.toFixed(2)} ${u.currency}`);
    }
  }

  console.log("\nTotals in this report:");
  for (const [currency, totals] of Object.entries(result.totalsByCurrency)) {
    console.log(`  ${totals.unitsSold} units, ${totals.royaltyTotal.toFixed(2)} ${currency}`);
  }

  runLedger();
  console.log("\nLedger refreshed dashboard/public/status.json.");
} catch (err) {
  console.error("Analyst failed:", err instanceof Error ? err.message : err);
  process.exit(1);
}
