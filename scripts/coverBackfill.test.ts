import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MIN_IMAGE_HEIGHT_PX, MIN_IMAGE_WIDTH_PX } from "../agents/bindery/kdpSpecs.ts";
import { writeValidTestCoverArt } from "../agents/bindery/testFixtures.ts";
import type { ImageGenClient } from "../agents/etch/geminiClient.ts";
import { runLoom } from "../agents/loom/index.ts";
import { runScout } from "../agents/scout/index.ts";
import { fakeClaudeClient } from "../agents/scout/testFixtures.ts";
import { runCoverBackfill } from "./coverBackfill.ts";

let tempDir: string | undefined;

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

function fakeImageClient(): ImageGenClient {
  return {
    generateImage: vi.fn(async () =>
      sharp({
        create: { width: MIN_IMAGE_WIDTH_PX, height: MIN_IMAGE_HEIGHT_PX, channels: 3, background: { r: 180, g: 180, b: 220 } },
      })
        .png()
        .toBuffer()
    ),
  };
}

describe("runCoverBackfill", () => {
  it("generates cover art for a batch that has none, using the stored prompts.json cover prompt", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "cover-backfill-"));
    const batchesDir = join(tempDir, "batches");
    const scouted = await runScout("Fantasy Castles", { batchesDir, claudeClient: fakeClaudeClient() });
    runLoom(scouted.batchId, { batchesDir, promptCount: 5 });

    const imageClient = fakeImageClient();
    const result = await runCoverBackfill(scouted.batchId, { batchesDir, imageClient });

    expect(result.manifest.coverArt?.source).toBe("etch");
    expect(imageClient.generateImage).toHaveBeenCalledTimes(1);

    const written = JSON.parse(readFileSync(join(result.batchDir, "manifest.json"), "utf-8"));
    expect(written.coverArt.source).toBe("etch");
    expect(written.coverArt.path).toBe(result.coverArtPath);
  }, 60000);

  it("falls back to a freshly built cover prompt for a batch whose prompts.json predates the cover field", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "cover-backfill-"));
    const batchesDir = join(tempDir, "batches");
    const scouted = await runScout("Fantasy Castles", { batchesDir, claudeClient: fakeClaudeClient() });
    runLoom(scouted.batchId, { batchesDir, promptCount: 5 });

    const promptsPath = join(batchesDir, scouted.batchId, "prompts.json");
    const promptsFile = JSON.parse(readFileSync(promptsPath, "utf-8"));
    delete promptsFile.cover;
    writeFileSync(promptsPath, JSON.stringify(promptsFile, null, 2));

    const imageClient = fakeImageClient();
    const result = await runCoverBackfill(scouted.batchId, { batchesDir, imageClient });

    expect(result.manifest.coverArt?.source).toBe("etch");
    expect(imageClient.generateImage).toHaveBeenCalledTimes(1);
  }, 60000);

  it("leaves existing cover art alone instead of regenerating it", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "cover-backfill-"));
    const batchesDir = join(tempDir, "batches");
    const scouted = await runScout("Cozy Cabins", { batchesDir, claudeClient: fakeClaudeClient() });
    runLoom(scouted.batchId, { batchesDir, promptCount: 5 });
    const coverArtPath = join(batchesDir, scouted.batchId, "cover-art.png");
    await writeValidTestCoverArt(coverArtPath);

    const imageClient = fakeImageClient();
    const result = await runCoverBackfill(scouted.batchId, { batchesDir, imageClient });

    expect(imageClient.generateImage).not.toHaveBeenCalled();
    expect(result.manifest.coverArt?.source).toBe("human");
    expect(result.coverArtPath).toBe(coverArtPath);
  }, 60000);

  it("throws if the batch does not exist", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "cover-backfill-"));
    const batchesDir = join(tempDir, "batches");
    await expect(runCoverBackfill("no-such-batch", { batchesDir })).rejects.toThrow(/No batch found/);
  });
});
