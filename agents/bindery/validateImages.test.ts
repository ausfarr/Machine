import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeUndersizedTestImage, writeValidTestImages } from "./testFixtures.ts";
import { validateImages } from "./validateImages.ts";

let tempDir: string | undefined;

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("validateImages", () => {
  it("throws if the images folder does not exist", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "bindery-test-"));
    await expect(validateImages(join(tempDir, "images"), 3)).rejects.toThrow(/not found/);
  });

  it("throws if the folder is empty", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "bindery-test-"));
    const imagesDir = join(tempDir, "images");
    mkdirSync(imagesDir);
    await expect(validateImages(imagesDir, 3)).rejects.toThrow(/empty/);
  });

  it("throws on an image count mismatch", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "bindery-test-"));
    const imagesDir = join(tempDir, "images");
    await writeValidTestImages(imagesDir, 3);
    await expect(validateImages(imagesDir, 5)).rejects.toThrow(/expected 5 images/);
  });

  it("throws on a gap in page numbering", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "bindery-test-"));
    const imagesDir = join(tempDir, "images");
    await writeValidTestImages(imagesDir, 3);
    // rename 03 -> 04 to create a gap at 3 while keeping count at 3
    renameSync(join(imagesDir, "03.png"), join(imagesDir, "04.png"));
    await expect(validateImages(imagesDir, 3)).rejects.toThrow(/outside the expected range|missing image/);
  });

  it("throws on an unsupported file extension", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "bindery-test-"));
    const imagesDir = join(tempDir, "images");
    await writeValidTestImages(imagesDir, 2);
    writeFileSync(join(imagesDir, "03.txt"), "not an image");
    await expect(validateImages(imagesDir, 3)).rejects.toThrow(/unsupported file/);
  });

  it("throws on a file with no leading page number", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "bindery-test-"));
    const imagesDir = join(tempDir, "images");
    await writeValidTestImages(imagesDir, 2);
    renameSync(join(imagesDir, "02.png"), join(imagesDir, "cover.png"));
    await expect(validateImages(imagesDir, 2)).rejects.toThrow(/doesn't start with a page number/);
  });

  it("throws when an image is below the minimum resolution", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "bindery-test-"));
    const imagesDir = join(tempDir, "images");
    await writeValidTestImages(imagesDir, 1);
    await writeUndersizedTestImage(join(imagesDir, "02.png"));
    await expect(validateImages(imagesDir, 2)).rejects.toThrow(/below the/);
  });

  it("accepts a valid, complete set of images in order", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "bindery-test-"));
    const imagesDir = join(tempDir, "images");
    await writeValidTestImages(imagesDir, 4);

    const { images, latestModifiedAt } = await validateImages(imagesDir, 4);

    expect(images.map((i) => i.index)).toEqual([1, 2, 3, 4]);
    expect(images.every((i) => i.format === "png")).toBe(true);
    expect(new Date(latestModifiedAt).toString()).not.toBe("Invalid Date");
  });
});
