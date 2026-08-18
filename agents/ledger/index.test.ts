import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runScout } from "../scout/index.ts";
import { runLoom } from "../loom/index.ts";
import { runLedger } from "./index.ts";

let tempDir: string | undefined;

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("runLedger", () => {
  it("reports zero batches truthfully when none exist, instead of a placeholder", () => {
    tempDir = mkdtempSync(join(tmpdir(), "ledger-test-"));
    const batchesDir = join(tempDir, "batches");
    const outputPath = join(tempDir, "status.json");

    const status = runLedger({ batchesDir, outputPath });

    expect(status.summary.totalBatches).toBe(0);
    expect(status.batches).toEqual([]);
    expect(Object.values(status.summary.byStage).every((n) => n === 0)).toBe(true);

    const written = JSON.parse(readFileSync(outputPath, "utf-8"));
    expect(written.summary.totalBatches).toBe(0);
  });

  it("reflects real batch stages from actual manifests", () => {
    tempDir = mkdtempSync(join(tmpdir(), "ledger-test-"));
    const batchesDir = join(tempDir, "batches");
    const outputPath = join(tempDir, "status.json");

    const researched = runScout("Fantasy Castles", { batchesDir });
    const prompted = runScout("Cozy Cabins", { batchesDir });
    runLoom(prompted.batchId, { batchesDir });

    const status = runLedger({ batchesDir, outputPath });

    expect(status.summary.totalBatches).toBe(2);
    expect(status.summary.byStage.researched).toBe(1);
    expect(status.summary.byStage.prompted).toBe(1);

    const found = status.batches.find((b) => b.batchId === researched.batchId);
    expect(found?.scout.done).toBe(true);
    expect(found?.loom.done).toBe(false);

    const promptedStatus = status.batches.find((b) => b.batchId === prompted.batchId);
    expect(promptedStatus?.loom.done).toBe(true);
    expect(promptedStatus?.loom.detail?.promptCount).toBe(24);
  });

  it("reports an invalid manifest under invalidBatches instead of crashing or skipping silently", () => {
    tempDir = mkdtempSync(join(tmpdir(), "ledger-test-"));
    const batchesDir = join(tempDir, "batches");
    const outputPath = join(tempDir, "status.json");

    const badBatchDir = join(batchesDir, "broken-batch");
    mkdirSync(badBatchDir, { recursive: true });
    writeFileSync(join(badBatchDir, "manifest.json"), JSON.stringify({ not: "a valid manifest" }));

    const status = runLedger({ batchesDir, outputPath });

    expect(status.summary.totalBatches).toBe(0);
    expect(status.summary.invalidBatchCount).toBe(1);
    expect(status.invalidBatches[0]?.batchId).toBe("broken-batch");
  });

  it("reports a batch folder with no manifest at all under invalidBatches", () => {
    tempDir = mkdtempSync(join(tmpdir(), "ledger-test-"));
    const batchesDir = join(tempDir, "batches");
    mkdirSync(join(batchesDir, "empty-folder"), { recursive: true });

    const status = runLedger({ batchesDir, outputPath: join(tempDir, "status.json") });

    expect(status.invalidBatches).toHaveLength(1);
    expect(status.invalidBatches[0]?.error).toMatch(/no manifest\.json/);
  });
});
