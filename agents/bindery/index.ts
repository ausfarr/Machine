import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { validateManifest, type BatchManifest } from "../../schemas/manifest.ts";
import { assembleInteriorPdf } from "./assemble.ts";
import { TRIM_SIZE_LABEL } from "./kdpSpecs.ts";
import { validateImages } from "./validateImages.ts";

export interface BinderyRunOptions {
  batchesDir?: string;
}

export interface BinderyRunResult {
  batchDir: string;
  manifest: BatchManifest;
  interiorPdfPath: string;
  pageCount: number;
}

export async function runBindery(batchId: string, options: BinderyRunOptions = {}): Promise<BinderyRunResult> {
  const batchesDir = options.batchesDir ?? "batches";
  const batchDir = join(batchesDir, batchId);
  const manifestPath = join(batchDir, "manifest.json");

  if (!existsSync(manifestPath)) {
    throw new Error(`No batch found at ${batchDir} — run Scout and Loom first.`);
  }

  const existingManifest = validateManifest(JSON.parse(readFileSync(manifestPath, "utf-8")));
  if (existingManifest.stage !== "prompted" && existingManifest.stage !== "imaged") {
    throw new Error(
      `Batch "${batchId}" is at stage "${existingManifest.stage}", but Bindery requires stage "prompted" or "imaged". Run Loom (and optionally Etch) first, or drop images into ${batchDir}/images/ by hand before running Bindery.`
    );
  }

  const expectedCount = existingManifest.loom?.promptCount;
  if (!expectedCount) {
    throw new Error(`Batch "${batchId}" manifest is missing loom.promptCount — cannot validate image count.`);
  }

  const imagesDir = join(batchDir, "images");
  const { images, latestModifiedAt } = await validateImages(imagesDir, expectedCount);

  const interiorPdfPath = join(batchDir, "interior.pdf");
  const pageCount = await assembleInteriorPdf(images, interiorPdfPath);

  const completedAt = new Date().toISOString();
  const manifestCandidate: BatchManifest = {
    ...existingManifest,
    stage: "assembled",
    updatedAt: completedAt,
    images: {
      folder: imagesDir,
      count: images.length,
      addedAt: latestModifiedAt,
      // Preserve Etch's provenance if it already ran; otherwise these images were supplied/edited by a human.
      source: existingManifest.images?.source ?? "human",
    },
    bindery: {
      interiorPdfPath,
      trimSize: TRIM_SIZE_LABEL,
      pageCount,
      completedAt,
    },
  };

  const manifest = validateManifest(manifestCandidate);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  return { batchDir, manifest, interiorPdfPath, pageCount };
}
