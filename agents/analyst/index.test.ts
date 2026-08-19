import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateManifest } from "../../schemas/manifest.ts";
import { writePublishedBatch } from "./testFixtures.ts";
import { runAnalyst } from "./index.ts";

let tempDir: string | undefined;

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("runAnalyst", () => {
  it("matches a report row to a batch by ASIN and writes the sales block into its manifest", () => {
    tempDir = mkdtempSync(join(tmpdir(), "analyst-test-"));
    const batchesDir = join(tempDir, "batches");
    const manifestPath = writePublishedBatch(batchesDir, "cozy-cottages", "Cozy Cottages", "B0COZY1234");

    const csv = ["ASIN,Currency,Net Units Sold,Royalty,Royalty Date", "B0COZY1234,USD,10,29.90,07/15/2026"].join("\n");

    const result = runAnalyst(csv, { batchesDir });

    expect(result.matched).toEqual([
      { batchId: "cozy-cottages", theme: "Cozy Cottages", asin: "B0COZY1234", currency: "USD", unitsSold: 10, royaltyTotal: 29.9 },
    ]);
    expect(result.unmatched).toEqual([]);
    expect(result.ambiguous).toEqual([]);

    const written = validateManifest(JSON.parse(readFileSync(manifestPath, "utf-8")));
    expect(written.published?.sales).toEqual({
      unitsSold: 10,
      royaltyTotal: 29.9,
      currency: "USD",
      reportPeriodEnd: new Date("07/15/2026").toISOString(),
      lastUpdated: expect.any(String),
    });
  });

  it("collects rows with no matching batch instead of failing the whole run", () => {
    tempDir = mkdtempSync(join(tmpdir(), "analyst-test-"));
    const batchesDir = join(tempDir, "batches");
    writePublishedBatch(batchesDir, "known-batch", "Known Batch", "B0KNOWN001");

    const csv = [
      "ASIN,Currency,Net Units Sold,Royalty",
      "B0KNOWN001,USD,5,10.00",
      "B0UNKNOWN9,USD,2,4.00",
    ].join("\n");

    const result = runAnalyst(csv, { batchesDir });

    expect(result.matched).toHaveLength(1);
    expect(result.unmatched).toEqual([{ asin: "B0UNKNOWN9", currency: "USD", unitsSold: 2, royaltyTotal: 4 }]);
  });

  it("does not auto-merge an ASIN that sold in more than one currency", () => {
    tempDir = mkdtempSync(join(tmpdir(), "analyst-test-"));
    const batchesDir = join(tempDir, "batches");
    const manifestPath = writePublishedBatch(batchesDir, "multi-currency", "Multi Currency", "B0MULTI001");

    const csv = [
      "ASIN,Currency,Net Units Sold,Royalty",
      "B0MULTI001,USD,10,30.00",
      "B0MULTI001,GBP,4,9.60",
    ].join("\n");

    const result = runAnalyst(csv, { batchesDir });

    expect(result.matched).toEqual([]);
    expect(result.ambiguous).toEqual([{ asin: "B0MULTI001", currencies: expect.arrayContaining(["USD", "GBP"]) }]);

    const written = validateManifest(JSON.parse(readFileSync(manifestPath, "utf-8")));
    expect(written.published?.sales).toBeUndefined();
  });

  it("updates (not duplicates) sales data on a repeat report for the same ASIN", () => {
    tempDir = mkdtempSync(join(tmpdir(), "analyst-test-"));
    const batchesDir = join(tempDir, "batches");
    const manifestPath = writePublishedBatch(batchesDir, "repeat-batch", "Repeat Batch", "B0REPEAT01");

    runAnalyst(["ASIN,Currency,Net Units Sold,Royalty,Royalty Date", "B0REPEAT01,USD,5,15.00,07/01/2026"].join("\n"), {
      batchesDir,
    });
    const firstWrite = validateManifest(JSON.parse(readFileSync(manifestPath, "utf-8")));
    expect(firstWrite.published?.sales?.unitsSold).toBe(5);

    runAnalyst(["ASIN,Currency,Net Units Sold,Royalty,Royalty Date", "B0REPEAT01,USD,12,35.00,07/31/2026"].join("\n"), {
      batchesDir,
    });
    const secondWrite = validateManifest(JSON.parse(readFileSync(manifestPath, "utf-8")));

    expect(secondWrite.published?.sales?.unitsSold).toBe(12);
    expect(secondWrite.published?.sales?.royaltyTotal).toBe(35);
    expect(secondWrite.published?.sales?.reportPeriodEnd).toBe(new Date("07/31/2026").toISOString());
  });

  it("reports zero batches matched when no batches exist, instead of throwing", () => {
    tempDir = mkdtempSync(join(tmpdir(), "analyst-test-"));
    const batchesDir = join(tempDir, "batches");

    const result = runAnalyst(["ASIN,Currency,Net Units Sold,Royalty", "B0NOBATCH1,USD,1,1.00"].join("\n"), { batchesDir });

    expect(result.matched).toEqual([]);
    expect(result.unmatched).toHaveLength(1);
  });
});
