import { existsSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import sharp from "sharp";
import { MIN_IMAGE_HEIGHT_PX, MIN_IMAGE_WIDTH_PX } from "./kdpSpecs.ts";

const SUPPORTED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg"]);
const SUPPORTED_FORMATS = new Set(["png", "jpeg"]);

export interface ValidatedImage {
  index: number;
  path: string;
  fileName: string;
  width: number;
  height: number;
  format: "png" | "jpeg";
}

export interface ValidateImagesResult {
  images: ValidatedImage[];
  /** Latest file modification time among the validated images, ISO 8601. */
  latestModifiedAt: string;
}

/**
 * Validates that imagesDir contains exactly expectedCount images, named
 * with a leading page number (e.g. "01.png") matching 1..expectedCount
 * with no gaps or duplicates, each meeting the minimum resolution for a
 * sharp 8.5x11in print. Throws with a specific, actionable message on the
 * first problem found rather than assembling a broken PDF.
 */
export async function validateImages(
  imagesDir: string,
  expectedCount: number
): Promise<ValidateImagesResult> {
  if (!existsSync(imagesDir)) {
    throw new Error(
      `Bindery: images folder not found at ${imagesDir}. Drop the ${expectedCount} generated images there before running Bindery.`
    );
  }

  const entries = readdirSync(imagesDir).filter((f) => !f.startsWith("."));
  if (entries.length === 0) {
    throw new Error(`Bindery: images folder ${imagesDir} is empty.`);
  }

  const parsed: { index: number; fileName: string }[] = [];
  for (const fileName of entries) {
    const ext = extname(fileName).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      throw new Error(
        `Bindery: unsupported file "${fileName}" in ${imagesDir} (expected .png, .jpg, or .jpeg). Remove it or rename it.`
      );
    }
    const match = fileName.match(/^0*(\d+)\./);
    if (!match) {
      throw new Error(
        `Bindery: file "${fileName}" doesn't start with a page number (expected e.g. "01.png"). Rename it to match its prompt index.`
      );
    }
    parsed.push({ index: Number(match[1]), fileName });
  }

  if (parsed.length !== expectedCount) {
    throw new Error(
      `Bindery: expected ${expectedCount} images (one per Loom prompt) but found ${parsed.length} in ${imagesDir}.`
    );
  }

  const seen = new Set<number>();
  for (const { index, fileName } of parsed) {
    if (index < 1 || index > expectedCount) {
      throw new Error(
        `Bindery: file "${fileName}" has page number ${index}, outside the expected range 1-${expectedCount}.`
      );
    }
    if (seen.has(index)) {
      throw new Error(`Bindery: duplicate page number ${index} (file "${fileName}").`);
    }
    seen.add(index);
  }
  for (let i = 1; i <= expectedCount; i++) {
    if (!seen.has(i)) {
      throw new Error(`Bindery: missing image for page ${i} — page order would have a gap.`);
    }
  }

  parsed.sort((a, b) => a.index - b.index);

  const images: ValidatedImage[] = [];
  let latestMtimeMs = 0;

  for (const { index, fileName } of parsed) {
    const path = join(imagesDir, fileName);

    const stat = statSync(path);
    latestMtimeMs = Math.max(latestMtimeMs, stat.mtimeMs);

    let metadata;
    try {
      metadata = await sharp(path).metadata();
    } catch (err) {
      throw new Error(`Bindery: could not read "${fileName}" as an image — it may be corrupt.`);
    }

    if (!metadata.width || !metadata.height) {
      throw new Error(`Bindery: could not determine dimensions for "${fileName}".`);
    }
    if (!metadata.format || !SUPPORTED_FORMATS.has(metadata.format)) {
      throw new Error(
        `Bindery: "${fileName}" has content type "${metadata.format ?? "unknown"}", but only PNG and JPEG are supported.`
      );
    }
    if (metadata.width < MIN_IMAGE_WIDTH_PX || metadata.height < MIN_IMAGE_HEIGHT_PX) {
      throw new Error(
        `Bindery: "${fileName}" is ${metadata.width}x${metadata.height}px, below the ${MIN_IMAGE_WIDTH_PX}x${MIN_IMAGE_HEIGHT_PX}px minimum for a sharp 8.5x11in print at 300 DPI.`
      );
    }

    images.push({
      index,
      path,
      fileName,
      width: metadata.width,
      height: metadata.height,
      format: metadata.format as "png" | "jpeg",
    });
  }

  return { images, latestModifiedAt: new Date(latestMtimeMs).toISOString() };
}
