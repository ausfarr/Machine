import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { afterEach, describe, expect, it } from "vitest";
import { validateManifest } from "../../schemas/manifest.ts";
import { runLoom } from "../loom/index.ts";
import { runScout } from "../scout/index.ts";
import { fakeClaudeClient } from "../scout/testFixtures.ts";
import { runBindery } from "./index.ts";
import { writeValidTestImages } from "./testFixtures.ts";

let tempDir: string | undefined;

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

async function scoutAndLoom(batchesDir: string, promptCount = 20) {
  const scouted = await runScout("Fantasy Castles", { batchesDir, claudeClient: fakeClaudeClient() });
  runLoom(scouted.batchId, { batchesDir, promptCount });
  return scouted.batchId;
}

describe("runBindery", () => {
  it("assembles a valid interior PDF and moves the batch to stage assembled", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "bindery-e2e-"));
    const batchId = await scoutAndLoom(tempDir, 20);
    await writeValidTestImages(join(tempDir, batchId, "images"), 20);

    const result = await runBindery(batchId, { batchesDir: tempDir });

    const manifestRaw = JSON.parse(readFileSync(join(result.batchDir, "manifest.json"), "utf-8"));
    const manifest = validateManifest(manifestRaw);
    expect(manifest.stage).toBe("assembled");
    expect(manifest.images?.count).toBe(20);
    expect(manifest.bindery?.pageCount).toBe(20);
    expect(manifest.bindery?.trimSize).toBe("8.5x11in");

    const pdfBytes = readFileSync(result.interiorPdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    expect(pdfDoc.getPageCount()).toBe(20);
    const page = pdfDoc.getPage(0);
    expect(page.getWidth()).toBeCloseTo(612, 0);
    expect(page.getHeight()).toBeCloseTo(792, 0);
  });

  it("refuses to run on a batch that isn't at stage prompted or imaged", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "bindery-e2e-"));
    const scouted = await runScout("Fantasy Castles", { batchesDir: tempDir, claudeClient: fakeClaudeClient() });
    await expect(runBindery(scouted.batchId, { batchesDir: tempDir })).rejects.toThrow(/requires stage "prompted" or "imaged"/);
  });

  it("fails loudly instead of assembling when images are missing", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "bindery-e2e-"));
    const batchId = await scoutAndLoom(tempDir, 20);
    await expect(runBindery(batchId, { batchesDir: tempDir })).rejects.toThrow(/images folder not found/);
  });

  it("fails loudly when the image count does not match the prompt count", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "bindery-e2e-"));
    const batchId = await scoutAndLoom(tempDir, 20);
    await writeValidTestImages(join(tempDir, batchId, "images"), 15);
    await expect(runBindery(batchId, { batchesDir: tempDir })).rejects.toThrow(/expected 20 images/);
  });

  it("accepts a batch already at stage imaged and preserves images.source", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "bindery-e2e-"));
    const batchId = await scoutAndLoom(tempDir, 20);
    const imagesDir = join(tempDir, batchId, "images");
    await writeValidTestImages(imagesDir, 20);

    const manifestPath = join(tempDir, batchId, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    manifest.stage = "imaged";
    manifest.images = { folder: imagesDir, count: 20, addedAt: new Date().toISOString(), source: "etch" };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const result = await runBindery(batchId, { batchesDir: tempDir });

    expect(result.manifest.stage).toBe("assembled");
    expect(result.manifest.images?.source).toBe("etch");
  });
});
