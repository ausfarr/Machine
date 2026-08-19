import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
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

function fakeClaudeClient(selectedTheme: string, generated: string[] = []): ClaudeClient {
  const selection: ThemeSelection = {
    selectedTheme,
    selectionRationale: `Picked "${selectedTheme}" for testing.`,
    rankings: [{ theme: selectedTheme, score: 100, rationale: "Highest scored candidate in this fake." }],
  };
  return {
    selectTheme: async () => selection,
    analyzeTheme: async () => fakeAnalysis,
    generateCandidateThemes: async () => generated,
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

    expect(result.theme).toBe("Cozy Cabins");
    expect(result.stage).toBe("listed");
    expect(result.remainingQueueLength).toBe(1);

    const remainingQueue = JSON.parse(readFileSync(queuePath, "utf-8"));
    expect(remainingQueue).toEqual(["Fantasy Castles"]);

    const manifest = JSON.parse(readFileSync(join(batchesDir, result.batchId, "manifest.json"), "utf-8"));
    expect(manifest.stage).toBe("listed");
    expect(manifest.images.source).toBe("etch");
    expect(manifest.scout.selectionRationale).toBe(result.selectionRationale);
  }, 60000);

  it("still runs the pipeline when theme-queue.json is empty, using Scout's own generated candidates", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "queue-test-"));
    const queuePath = join(tempDir, "theme-queue.json");
    const batchesDir = join(tempDir, "batches");
    // No writeQueue call — theme-queue.json doesn't even exist.

    const result = await runPipelineFromQueue({
      queuePath,
      batchesDir,
      claudeClient: fakeClaudeClient("Woodland Creatures", ["Woodland Creatures", "Cozy Cabins"]),
      imageClient: fakeImageClient(),
      promptCount: 20,
    });

    expect(result.theme).toBe("Woodland Creatures");
    expect(result.stage).toBe("listed");
    // The human queue was never populated, so consuming the selection leaves it empty, not negative/broken.
    expect(result.remainingQueueLength).toBe(0);
    expect(readQueue(queuePath)).toEqual([]);
  }, 60000);

  it("leaves a human-queued theme untouched when Claude selects one of its own generated candidates instead", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "queue-test-"));
    const queuePath = join(tempDir, "theme-queue.json");
    const batchesDir = join(tempDir, "batches");
    writeQueue(queuePath, ["Fantasy Castles"]);

    const result = await runPipelineFromQueue({
      queuePath,
      batchesDir,
      claudeClient: fakeClaudeClient("Cozy Cabins", ["Cozy Cabins"]),
      imageClient: fakeImageClient(),
      promptCount: 20,
    });

    expect(result.theme).toBe("Cozy Cabins");
    // "Fantasy Castles" was never selected, so it must still be in the human queue afterward.
    expect(readQueue(queuePath)).toEqual(["Fantasy Castles"]);
  }, 60000);

  it("throws instead of fabricating a batch when there are no candidates at all", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "queue-test-"));
    const queuePath = join(tempDir, "theme-queue.json");
    const batchesDir = join(tempDir, "batches");

    await expect(
      runPipelineFromQueue({
        queuePath,
        batchesDir,
        claudeClient: fakeClaudeClient("unused", []),
        imageClient: fakeImageClient(),
      })
    ).rejects.toThrow(/No candidate themes available/);
  });

  it("asks Scout to avoid themes already produced by an existing batch", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "queue-test-"));
    const queuePath = join(tempDir, "theme-queue.json");
    const batchesDir = join(tempDir, "batches");
    mkdirSync(join(batchesDir, "cats"), { recursive: true });
    writeFileSync(join(batchesDir, "cats", "manifest.json"), JSON.stringify({ theme: "Cats" }));

    const generateCandidateThemes = vi.fn(async () => ["Cozy Cabins"]);
    const client: ClaudeClient = {
      selectTheme: async () => ({
        selectedTheme: "Cozy Cabins",
        selectionRationale: "x",
        rankings: [{ theme: "Cozy Cabins", score: 100, rationale: "x" }],
      }),
      analyzeTheme: async () => fakeAnalysis,
      generateCandidateThemes,
    };

    await runPipelineFromQueue({ queuePath, batchesDir, claudeClient: client, imageClient: fakeImageClient(), promptCount: 20 });

    expect(generateCandidateThemes).toHaveBeenCalledWith(expect.any(Number), ["Cats"]);
  }, 60000);

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
