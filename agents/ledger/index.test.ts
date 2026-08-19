import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { runScout } from "../scout/index.ts";
import { fakeClaudeClient } from "../scout/testFixtures.ts";
import { runLoom } from "../loom/index.ts";
import { runEtch } from "../etch/index.ts";
import type { ImageGenClient } from "../etch/geminiClient.ts";
import { runAnalyst } from "../analyst/index.ts";
import { writePublishedBatch } from "../analyst/testFixtures.ts";
import { runLedger } from "./index.ts";

async function tinyPngBuffer(): Promise<Buffer> {
  return sharp({ create: { width: 32, height: 32, channels: 3, background: { r: 200, g: 200, b: 200 } } })
    .png()
    .toBuffer();
}

function fakeImageClient(buffer: Buffer): ImageGenClient {
  return { generateImage: async () => buffer };
}

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

  it("reflects real batch stages from actual manifests", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "ledger-test-"));
    const batchesDir = join(tempDir, "batches");
    const outputPath = join(tempDir, "status.json");

    const researched = await runScout("Fantasy Castles", { batchesDir, claudeClient: fakeClaudeClient() });
    const prompted = await runScout("Cozy Cabins", { batchesDir, claudeClient: fakeClaudeClient() });
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

  it("computes real per-agent activity from actual manifest data, not placeholders", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "ledger-test-"));
    const batchesDir = join(tempDir, "batches");

    const scouted = await runScout("Ocean Reefs", { batchesDir, claudeClient: fakeClaudeClient() });
    runLoom(scouted.batchId, { batchesDir, promptCount: 20 });
    const buffer = await tinyPngBuffer();
    await runEtch(scouted.batchId, { batchesDir, imageClient: fakeImageClient(buffer) });

    const status = runLedger({ batchesDir, outputPath: join(tempDir, "status.json") });

    const scout = status.agents.find((a) => a.agent === "scout");
    expect(scout?.status).toBe("active");
    expect(scout?.metric).toEqual({ label: "Themes researched", value: 1 });

    const loom = status.agents.find((a) => a.agent === "loom");
    expect(loom?.metric).toEqual({ label: "Prompts generated", value: 20 });

    const etch = status.agents.find((a) => a.agent === "etch");
    expect(etch?.status).toBe("active");
    expect(etch?.metric).toEqual({ label: "Images generated", value: 20 });

    const batch = status.batches.find((b) => b.batchId === scouted.batchId);
    expect(batch?.coverArt.done).toBe(true);
    expect(batch?.coverArt.detail?.source).toBe("etch");

    // Bindery/Crier haven't run on this batch yet — real zero, not a guess.
    const bindery = status.agents.find((a) => a.agent === "bindery");
    expect(bindery?.status).toBe("not_yet_run");
    expect(bindery?.metric.value).toBe(0);

    // No run-log.json in this temp dir, so Sentinel honestly reports it never ran.
    // Analyst has no producer at all yet (CLAUDE.md "Build order").
    const sentinel = status.agents.find((a) => a.agent === "sentinel");
    expect(sentinel).toEqual({
      agent: "sentinel",
      status: "not_yet_run",
      lastRanAt: null,
      metric: { label: "Fix PRs drafted", value: 0 },
    });
    const analyst = status.agents.find((a) => a.agent === "analyst");
    expect(analyst).toEqual({
      agent: "analyst",
      status: "not_yet_run",
      lastRanAt: null,
      metric: { label: "Royalties reported", value: 0 },
    });

    const ledger = status.agents.find((a) => a.agent === "ledger");
    expect(ledger?.status).toBe("active");
    expect(ledger?.metric).toEqual({ label: "Batches tracked", value: 1 });
  });

  it("builds a chronological activity feed sourced from real manifest timestamps", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "ledger-test-"));
    const batchesDir = join(tempDir, "batches");

    const scouted = await runScout("Desert Canyons", { batchesDir, claudeClient: fakeClaudeClient() });
    // Guarantee Loom's completedAt lands in a later millisecond than Scout's, so
    // sort order isn't left to a coin flip on fast/parallel test runs.
    await new Promise((resolve) => setTimeout(resolve, 5));
    runLoom(scouted.batchId, { batchesDir, promptCount: 20 });

    const status = runLedger({ batchesDir, outputPath: join(tempDir, "status.json") });

    expect(status.activity.length).toBe(2);
    // Newest first: Loom ran after Scout.
    expect(status.activity[0]?.actor).toBe("loom");
    expect(status.activity[0]?.summary).toMatch(/Loom wrote 20 image prompts/);
    expect(status.activity[1]?.actor).toBe("scout");
    expect(new Date(status.activity[0]!.at).getTime()).toBeGreaterThanOrEqual(new Date(status.activity[1]!.at).getTime());
  });

  it("reports Sentinel's real activity from its run-log instead of a hardcoded stub", () => {
    tempDir = mkdtempSync(join(tmpdir(), "ledger-test-"));
    const batchesDir = join(tempDir, "batches");
    const sentinelRunLogPath = join(tempDir, "sentinel-run-log.json");

    writeFileSync(
      sentinelRunLogPath,
      JSON.stringify([
        { at: "2026-08-10T12:00:00Z", headSha: "aaa", outcome: "no_confident_fix", summary: "Flaky network mock in a test" },
        {
          at: "2026-08-19T12:00:00Z",
          headSha: "bbb",
          outcome: "patch_applied",
          summary: "Fixed a missing import",
          prUrl: "https://github.com/ausfarr/Machine/pull/99",
        },
      ])
    );

    const status = runLedger({ batchesDir, outputPath: join(tempDir, "status.json"), sentinelRunLogPath });

    const sentinel = status.agents.find((a) => a.agent === "sentinel");
    expect(sentinel?.lastRanAt).toBe("2026-08-19T12:00:00Z");
    expect(sentinel?.metric).toEqual({ label: "Fix PRs drafted", value: 1 });
  });

  it("treats a missing Sentinel run-log as an honest 'never run', not an error", () => {
    tempDir = mkdtempSync(join(tmpdir(), "ledger-test-"));
    const batchesDir = join(tempDir, "batches");

    const status = runLedger({
      batchesDir,
      outputPath: join(tempDir, "status.json"),
      sentinelRunLogPath: join(tempDir, "does-not-exist.json"),
    });

    const sentinel = status.agents.find((a) => a.agent === "sentinel");
    expect(sentinel?.status).toBe("not_yet_run");
    expect(sentinel?.lastRanAt).toBeNull();
  });

  it("computes batchesInProgress as batches not yet published", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "ledger-test-"));
    const batchesDir = join(tempDir, "batches");

    await runScout("Mountain Trails", { batchesDir, claudeClient: fakeClaudeClient() });
    await runScout("City Skylines", { batchesDir, claudeClient: fakeClaudeClient() });

    const status = runLedger({ batchesDir, outputPath: join(tempDir, "status.json") });

    expect(status.summary.totalBatches).toBe(2);
    expect(status.summary.byStage.published).toBe(0);
    expect(status.summary.batchesInProgress).toBe(2);
  });

  it("reports an honest zero fleet summary when no batch has sales data", () => {
    tempDir = mkdtempSync(join(tmpdir(), "ledger-test-"));
    const batchesDir = join(tempDir, "batches");
    writePublishedBatch(batchesDir, "no-sales-batch", "No Sales Batch", "B0NOSALES1");

    const status = runLedger({ batchesDir, outputPath: join(tempDir, "status.json") });

    expect(status.fleet).toEqual({ totalRevenueByCurrency: {}, totalUnitsSold: 0, batchesWithSalesData: 0 });

    const analyst = status.agents.find((a) => a.agent === "analyst");
    expect(analyst).toEqual({
      agent: "analyst",
      status: "not_yet_run",
      lastRanAt: null,
      metric: { label: "Royalties reported", value: 0 },
    });
  });

  it("sums real royalty totals per batch, grouped by currency and never combined across currencies", () => {
    tempDir = mkdtempSync(join(tmpdir(), "ledger-test-"));
    const batchesDir = join(tempDir, "batches");
    writePublishedBatch(batchesDir, "usd-batch-1", "USD Batch 1", "B0USDONE01");
    writePublishedBatch(batchesDir, "usd-batch-2", "USD Batch 2", "B0USDTWO02");
    writePublishedBatch(batchesDir, "gbp-batch", "GBP Batch", "B0GBPONE01");
    writePublishedBatch(batchesDir, "no-report-yet", "No Report Yet", "B0NOREPRT1");

    runAnalyst(
      [
        "ASIN,Currency,Net Units Sold,Royalty,Royalty Date",
        "B0USDONE01,USD,10,29.90,07/15/2026",
        "B0USDTWO02,USD,5,14.95,07/15/2026",
        "B0GBPONE01,GBP,3,8.10,07/15/2026",
      ].join("\n"),
      { batchesDir }
    );

    const status = runLedger({ batchesDir, outputPath: join(tempDir, "status.json") });

    expect(status.fleet).toEqual({
      totalRevenueByCurrency: { USD: 44.85, GBP: 8.1 },
      totalUnitsSold: 18,
      batchesWithSalesData: 3,
    });

    const analyst = status.agents.find((a) => a.agent === "analyst");
    expect(analyst?.status).toBe("active");
    expect(analyst?.metric).toEqual({ label: "Royalties reported", value: 3 });
  });
});
