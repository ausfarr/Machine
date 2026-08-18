import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import type { ClaudeClient, ThemeAnalysis, ThemeSelection } from "../agents/scout/claudeClient.ts";
import type { ImageGenClient } from "../agents/etch/geminiClient.ts";
import { readQueue, runPipelineFromQueue, writeQueue } from "./queue.ts";

let tempDir: string | undefined;

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

const fakeAnalysis: ThemeAnalysis = {
  competitionLevel: "low",
  competitionRationale: "Fake rationale for testing.",
  suggestedAngle: "Fake angle for testing.",
  keywordVariants: ["cozy cabins coloring book"],
};

function fakeClaudeClient(selectedTheme: string): ClaudeClient {
  const selection: ThemeSelection = {
    selectedTheme,
    selectionRationale: `Picked "${selectedTheme}" for testing.`,
    rankings: [{ theme: selectedTheme, score: 100, rationale: "Highest scored candidate in this fake." }],
  };
  return {
    selectTheme: async () => selection,
    analyzeTheme: async () => fakeAnalysis,
  };
}

function fakeImageClient(): ImageGenClient {
  return {
    generateImage: async () =>
      sharp({ create: { width: 32, height: 32, channels: 3, background: { r: 255, g: 255, b: 255 } } })
        .png()
        .toBuffer(),
  };
}

describe("readQueue / writeQueue", () => {
  it("returns an empty array when the queue file doesn't exist", () => {
    tempDir = mkdtempSync(join(tmpdir(), "queue-test-"));
    expect(readQueue(join(tempDir, "theme-queue.json"))).toEqual([]);
  });

  it("round-trips a written queue", () => {
    tempDir = mkdtempSync(join(tmpdir(), "queue-test-"));
    const queuePath = join(tempDir, "theme-queue.json");
    writeQueue(queuePath, ["Fantasy Castles", "Cozy Cabins"]);
    expect(readQueue(queuePath)).toEqual(["Fantasy Castles", "Cozy Cabins"]);
  });

  it("throws on a malformed queue file instead of silently ignoring it", () => {
    tempDir = mkdtempSync(join(tmpdir(), "queue-test-"));
    const queuePath = join(tempDir, "theme-queue.json");
    writeFileSync(queuePath, JSON.stringify({ not: "an array" }));
    expect(() => readQueue(queuePath)).toThrow(/must be a JSON array/);
  });
});

describe("runPipelineFromQueue", () => {
  it("reports processed:false on an empty queue instead of fabricating a batch", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "queue-test-"));
    const result = await runPipelineFromQueue({
      queuePath: join(tempDir, "theme-queue.json"),
      batchesDir: join(tempDir, "batches"),
      claudeClient: fakeClaudeClient("unused"),
      imageClient: fakeImageClient(),
    });
    expect(result.processed).toBe(false);
  });

  it("runs the whole pipeline on the theme Claude selects, even when it isn't first in the queue", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "queue-test-"));
    const queuePath = join(tempDir, "theme-queue.json");
    const batchesDir = join(tempDir, "batches");
    writeQueue(queuePath, ["Fantasy Castles", "Cozy Cabins"]);

    const result = await runPipelineFromQueue({
      queuePath,
      batchesDir,
      claudeClient: fakeClaudeClient("Cozy Cabins"),
      imageClient: fakeImageClient(),
      promptCount: 20,
    });

    expect(result.processed).toBe(true);
    if (!result.processed) throw new Error("unreachable");
    expect(result.theme).toBe("Cozy Cabins");
    expect(result.stage).toBe("listed");
    expect(result.remainingQueueLength).toBe(1);

    const remainingQueue = JSON.parse(readFileSync(queuePath, "utf-8"));
    expect(remainingQueue).toEqual(["Fantasy Castles"]);

    const manifest = JSON.parse(readFileSync(join(batchesDir, result.batchId, "manifest.json"), "utf-8"));
    expect(manifest.stage).toBe("listed");
    expect(manifest.images.source).toBe("etch");
    expect(manifest.scout.selectionRationale).toBe(result.selectionRationale);
  });

  it("leaves the theme out of the queue even if a downstream step fails, instead of retrying it forever", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "queue-test-"));
    const queuePath = join(tempDir, "theme-queue.json");
    const batchesDir = join(tempDir, "batches");
    writeQueue(queuePath, ["Cozy Cabins"]);

    const failingImageClient: ImageGenClient = {
      generateImage: async () => {
        throw new Error("simulated Gemini outage");
      },
    };

    await expect(
      runPipelineFromQueue({
        queuePath,
        batchesDir,
        claudeClient: fakeClaudeClient("Cozy Cabins"),
        imageClient: failingImageClient,
      })
    ).rejects.toThrow(/simulated Gemini outage/);

    expect(readQueue(queuePath)).toEqual([]);
  });
});
