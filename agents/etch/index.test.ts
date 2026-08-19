import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { runLoom } from "../loom/index.ts";
import { runScout } from "../scout/index.ts";
import { fakeClaudeClient } from "../scout/testFixtures.ts";
import type { ImageGenClient } from "./geminiClient.ts";
import { runEtch } from "./index.ts";

let tempDir: string | undefined;

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

async function tinyPngBuffer(): Promise<Buffer> {
  return sharp({ create: { width: 32, height: 32, channels: 3, background: { r: 200, g: 200, b: 200 } } })
    .png()
    .toBuffer();
}

function fakeImageClient(buffer: Buffer, opts: { failOnCallNumber?: number } = {}): ImageGenClient {
  let calls = 0;
  return {
    generateImage: async () => {
      calls += 1;
      if (opts.failOnCallNumber !== undefined && calls === opts.failOnCallNumber) {
        throw new Error("simulated failure");
      }
      return buffer;
    },
  };
}

async function seedPromptedBatch(batchesDir: string, promptCount = 20) {
  const scouted = await runScout("Fantasy Castles", { batchesDir, claudeClient: fakeClaudeClient() });
  const loomed = runLoom(scouted.batchId, { batchesDir, promptCount });
  return { batchId: scouted.batchId, loomed };
}

describe("runEtch", () => {
  it("generates one image per prompt and moves the batch to stage imaged", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "etch-test-"));
    const { batchId } = await seedPromptedBatch(tempDir, 20);
    const buffer = await tinyPngBuffer();

    const result = await runEtch(batchId, { batchesDir: tempDir, imageClient: fakeImageClient(buffer) });

    expect(result.count).toBe(20);
    expect(result.manifest.stage).toBe("imaged");
    expect(result.manifest.images?.source).toBe("etch");
    expect(result.manifest.images?.count).toBe(20);
    expect(result.manifest.coverArt?.source).toBe("etch");
    expect(result.manifest.coverArt?.path).toBe(join(result.batchDir, "cover-art.png"));

    const files = ["01.png", "10.png", "20.png"];
    for (const f of files) {
      const meta = await sharp(join(result.imagesDir, f)).metadata();
      expect(meta.width).toBeGreaterThanOrEqual(2550);
      expect(meta.height).toBeGreaterThanOrEqual(3300);
    }

    const coverMeta = await sharp(join(result.batchDir, "cover-art.png")).metadata();
    expect(coverMeta.width).toBeGreaterThanOrEqual(2550);
    expect(coverMeta.height).toBeGreaterThanOrEqual(3300);
  });

  it("throws if the batch isn't at stage prompted", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "etch-test-"));
    const { batchId } = await seedPromptedBatch(tempDir, 20);
    const buffer = await tinyPngBuffer();

    await runEtch(batchId, { batchesDir: tempDir, imageClient: fakeImageClient(buffer) });

    await expect(runEtch(batchId, { batchesDir: tempDir, imageClient: fakeImageClient(buffer) })).rejects.toThrow(
      /requires stage "prompted"/
    );
  });

  it("fails loudly and leaves the manifest at stage prompted when image generation fails partway", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "etch-test-"));
    const { batchId } = await seedPromptedBatch(tempDir, 20);
    const buffer = await tinyPngBuffer();

    await expect(
      runEtch(batchId, { batchesDir: tempDir, imageClient: fakeImageClient(buffer, { failOnCallNumber: 2 }) })
    ).rejects.toThrow(/image generation failed for page 2/);

    const manifest = JSON.parse(readFileSync(join(tempDir, batchId, "manifest.json"), "utf-8"));
    expect(manifest.stage).toBe("prompted");
  });

  it("throws if no batch exists at the given id", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "etch-test-"));
    const buffer = await tinyPngBuffer();
    await expect(runEtch("nonexistent", { batchesDir: tempDir, imageClient: fakeImageClient(buffer) })).rejects.toThrow(
      /No batch found/
    );
  });
});
