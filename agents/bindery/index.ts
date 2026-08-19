import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { validateManifest, type BatchManifest } from "../../schemas/manifest.ts";
import { generateBackCoverBlurbDraft } from "../loom/templates.ts";
import { assembleInteriorPdf } from "./assemble.ts";
import { assembleCoverPdf } from "./assembleCover.ts";
import { TRIM_SIZE_LABEL } from "./kdpSpecs.ts";
import { validateImages } from "./validateImages.ts";

const COVER_ART_FILENAME = "cover-art.png";

export interface BinderyRunOptions {
  batchesDir?: string;
}

export interface BinderyRunResult {
  batchDir: string;
  manifest: BatchManifest;
  interiorPdfPath: string;
  coverPdfPath: string;
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

  const coverArtPath = existingManifest.coverArt?.path ?? join(batchDir, COVER_ART_FILENAME);
  if (!existsSync(coverArtPath)) {
    throw new Error(
      `Bindery: no cover art found at ${coverArtPath}. Run Etch to generate one, or drop a "${COVER_ART_FILENAME}" file into ${batchDir} by hand before running Bindery.`
    );
  }
  // Falls back to Loom's own deterministic draft-generator for a batch whose
  // stored manifest predates this field — that function only needs the
  // theme, not a fresh Loom run, so this isn't fabricated text.
  const backCoverBlurb = existingManifest.loom?.backCoverBlurbDraft ?? generateBackCoverBlurbDraft(existingManifest.theme);

  const interiorPdfPath = join(batchDir, "interior.pdf");
  const pageCount = await assembleInteriorPdf(images, interiorPdfPath);

  const coverPdfPath = join(batchDir, "cover.pdf");
  await assembleCoverPdf(coverArtPath, backCoverBlurb, existingManifest.theme, pageCount, coverPdfPath);

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
    coverArt: {
      path: coverArtPath,
      addedAt: existingManifest.coverArt?.addedAt ?? completedAt,
      // Preserve Etch's provenance if it already ran; otherwise this cover art was supplied/edited by a human.
      source: existingManifest.coverArt?.source ?? "human",
    },
    bindery: {
      interiorPdfPath,
      trimSize: TRIM_SIZE_LABEL,
      pageCount,
      coverPdfPath,
      completedAt,
    },
  };

  const manifest = validateManifest(manifestCandidate);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  return { batchDir, manifest, interiorPdfPath, coverPdfPath, pageCount };
}
