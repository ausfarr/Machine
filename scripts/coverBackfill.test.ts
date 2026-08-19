import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runBindery } from "../agents/bindery/index.ts";
import { MIN_IMAGE_HEIGHT_PX, MIN_IMAGE_WIDTH_PX } from "../agents/bindery/kdpSpecs.ts";
import { writeValidTestCoverArt, writeValidTestImages } from "../agents/bindery/testFixtures.ts";
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

/** Assembles a batch up through "assembled" the normal way, then strips its cover data/files to simulate a batch that predates cover generation entirely. */
async function seedOldStyleAssembledBatch(batchesDir: string, promptCount = 5) {
  const scouted = await runScout("Fantasy Castles", { batchesDir, claudeClient: fakeClaudeClient() });
  runLoom(scouted.batchId, { batchesDir, promptCount });
  const batchDir = join(batchesDir, scouted.batchId);
  await writeValidTestImages(join(batchDir, "images"), promptCount);
  await writeValidTestCoverArt(join(batchDir, "cover-art.png"));
  await runBindery(scouted.batchId, { batchesDir });

  // Strip everything cover-related to simulate a genuinely pre-cover-feature batch.
  unlinkSync(join(batchDir, "cover-art.png"));
  unlinkSync(join(batchDir, "cover.pdf"));
  const manifestPath = join(batchDir, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  delete manifest.coverArt;
  delete manifest.bindery.coverPdfPath;
  delete manifest.loom.backCoverBlurbDraft;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  const promptsPath = manifest.loom.promptsPath;
  const promptsFile = JSON.parse(readFileSync(promptsPath, "utf-8"));
  delete promptsFile.cover;
  writeFileSync(promptsPath, JSON.stringify(promptsFile, null, 2));

  return scouted.batchId;
}

describe("runCoverBackfill", () => {
  it("generates cover art and cover.pdf for a batch that predates cover generation, without touching interior.pdf or stage", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "cover-backfill-"));
    const batchesDir = join(tempDir, "batches");
    const batchId = await seedOldStyleAssembledBatch(batchesDir, 5);

    const imageClient = fakeImageClient();
    const result = await runCoverBackfill(batchId, { batchesDir, imageClient });

    expect(result.manifest.coverArt?.source).toBe("etch");
    expect(result.manifest.bindery?.coverPdfPath).toBe(result.coverPdfPath);
    expect(result.manifest.stage).toBe("assembled");
    expect(imageClient.generateImage).toHaveBeenCalledTimes(1);

    const written = JSON.parse(readFileSync(join(result.batchDir, "manifest.json"), "utf-8"));
    expect(written.coverArt.source).toBe("etch");
  }, 60000);

  it("reuses existing cover art instead of calling the image client when only cover.pdf is missing", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "cover-backfill-"));
    const batchesDir = join(tempDir, "batches");
    const scouted = await runScout("Cozy Cabins", { batchesDir, claudeClient: fakeClaudeClient() });
    runLoom(scouted.batchId, { batchesDir, promptCount: 5 });
    const batchDir = join(batchesDir, scouted.batchId);
    await writeValidTestImages(join(batchDir, "images"), 5);
    await writeValidTestCoverArt(join(batchDir, "cover-art.png"));
    await runBindery(scouted.batchId, { batchesDir });

    // Someone deleted just the assembled cover.pdf, keeping the art.
    unlinkSync(join(batchDir, "cover.pdf"));

    const imageClient = fakeImageClient();
    const result = await runCoverBackfill(scouted.batchId, { batchesDir, imageClient });

    expect(imageClient.generateImage).not.toHaveBeenCalled();
    expect(result.manifest.coverArt?.source).toBe("human");
  }, 60000);

  it("throws instead of running when the batch hasn't been assembled yet", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "cover-backfill-"));
    const batchesDir = join(tempDir, "batches");
    const scouted = await runScout("Fantasy Castles", { batchesDir, claudeClient: fakeClaudeClient() });
    runLoom(scouted.batchId, { batchesDir, promptCount: 5 });

    await expect(runCoverBackfill(scouted.batchId, { batchesDir })).rejects.toThrow(/hasn't been assembled yet/);
  });

  it("throws if the batch does not exist", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "cover-backfill-"));
    const batchesDir = join(tempDir, "batches");
    await expect(runCoverBackfill("no-such-batch", { batchesDir })).rejects.toThrow(/No batch found/);
  });
});
