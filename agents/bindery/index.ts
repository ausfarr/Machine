import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { validateManifest, type BatchManifest } from "../../schemas/manifest.ts";
import { assembleInteriorPdf } from "./assemble.ts";
import { TRIM_SIZE_LABEL } from "./kdpSpecs.ts";
import { assembleManuscriptPdf, type ManuscriptChapter } from "./typeset.ts";
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

interface ManuscriptSectionEntry {
  index: number;
  title: string;
  body: string;
}

interface ManuscriptFile {
  frontMatterDraft: string;
  backMatterDraft: string;
  sections: ManuscriptSectionEntry[];
}

async function runBinderyImageGrid(
  batchId: string,
  batchDir: string,
  manifestPath: string,
  existingManifest: BatchManifest
): Promise<BinderyRunResult> {
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

async function runBinderyManuscript(
  batchId: string,
  batchDir: string,
  manifestPath: string,
  existingManifest: BatchManifest
): Promise<BinderyRunResult> {
  const manuscriptJsonPath = existingManifest.writer?.manuscriptJsonPath;
  if (!manuscriptJsonPath || !existsSync(manuscriptJsonPath)) {
    throw new Error(`Batch "${batchId}" manifest has no valid writer.manuscriptJsonPath — cannot find manuscript.json.`);
  }

  let manuscript: ManuscriptFile;
  try {
    manuscript = JSON.parse(readFileSync(manuscriptJsonPath, "utf-8"));
  } catch (err) {
    throw new Error(`Bindery: could not parse ${manuscriptJsonPath} as JSON: ${err instanceof Error ? err.message : err}`);
  }
  if (!Array.isArray(manuscript.sections) || manuscript.sections.length === 0) {
    throw new Error(`Bindery: ${manuscriptJsonPath} has no sections to typeset.`);
  }

  const chapters: ManuscriptChapter[] = [
    { title: "Front Matter", body: manuscript.frontMatterDraft },
    ...manuscript.sections.map((s) => ({ title: s.title, body: s.body })),
    { title: "Thank You", body: manuscript.backMatterDraft },
  ];

  const interiorPdfPath = join(batchDir, "interior.pdf");
  // The running head just needs the batch's real theme text — Crier's
  // actual listing title for a text-only category isn't built yet (see
  // agents/crier/README.md's "Known v2 gap"), so this deliberately
  // doesn't reach for buildTitle()/buildManuscriptTitle() from Crier's
  // territory the way Loom's cover prompt does for illustrated batches.
  const { pageCount } = await assembleManuscriptPdf(chapters, existingManifest.theme, interiorPdfPath);

  const completedAt = new Date().toISOString();
  const manifestCandidate: BatchManifest = {
    ...existingManifest,
    stage: "assembled",
    updatedAt: completedAt,
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

/**
 * Assembles a batch's interior PDF in whichever mode its content type
 * calls for: image-grid (illustrated batches, stage "prompted"/"imaged")
 * or manuscript-typesetting (Writer-sourced text batches, stage
 * "manuscripted"). Fails loudly if the wrong assets are present for the
 * selected mode rather than guessing — see CLAUDE.md's Bindery section.
 */
export async function runBindery(batchId: string, options: BinderyRunOptions = {}): Promise<BinderyRunResult> {
  const batchesDir = options.batchesDir ?? "batches";
  const batchDir = join(batchesDir, batchId);
  const manifestPath = join(batchDir, "manifest.json");

  if (!existsSync(manifestPath)) {
    throw new Error(`No batch found at ${batchDir} — run Scout and Loom first.`);
  }

  const existingManifest = validateManifest(JSON.parse(readFileSync(manifestPath, "utf-8")));

  if (existingManifest.stage === "manuscripted") {
    return runBinderyManuscript(batchId, batchDir, manifestPath, existingManifest);
  }

  if (existingManifest.stage !== "prompted" && existingManifest.stage !== "imaged") {
    throw new Error(
      `Batch "${batchId}" is at stage "${existingManifest.stage}", but Bindery requires stage "prompted", "imaged", or "manuscripted". Run Loom (and optionally Etch) first, drop images into ${batchDir}/images/ by hand before running Bindery, or run Writer first for a text-only category.`
    );
  }

  return runBinderyImageGrid(batchId, batchDir, manifestPath, existingManifest);
}
