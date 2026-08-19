import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assembleCoverPdf } from "../agents/bindery/assembleCover.ts";
import { COVER_ART_FILENAME } from "../agents/etch/index.ts";
import { generateCoverArt } from "../agents/etch/generateCoverArt.ts";
import { GeminiImageClient, type ImageGenClient } from "../agents/etch/geminiClient.ts";
import { buildCoverPrompt, generateBackCoverBlurbDraft } from "../agents/loom/templates.ts";
import { validateManifest, type BatchManifest } from "../schemas/manifest.ts";

export interface CoverBackfillOptions {
  batchesDir?: string;
  /** Injected for tests; defaults to a real Gemini-backed client. Only constructed if cover art actually needs generating. */
  imageClient?: ImageGenClient;
}

export interface CoverBackfillResult {
  batchDir: string;
  manifest: BatchManifest;
  coverArtPath: string;
  coverPdfPath: string;
}

/** Reads the cover art prompt out of a batch's prompts.json, if it has one. */
function readStoredCoverPrompt(manifest: BatchManifest): string | undefined {
  const promptsPath = manifest.loom?.promptsPath;
  if (!promptsPath || !existsSync(promptsPath)) {
    return undefined;
  }
  try {
    const promptsFile = JSON.parse(readFileSync(promptsPath, "utf-8"));
    return typeof promptsFile?.cover?.prompt === "string" ? promptsFile.cover.prompt : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Generates (or reuses) cover art and assembles cover.pdf for a batch whose
 * interior is already assembled — without re-running Scout, Loom, Etch, or
 * Bindery's interior assembly. Covers two real cases: a batch that predates
 * cover generation entirely (falls back to Loom's own deterministic
 * prompt/blurb builders, which only need the theme — not a fresh Loom run),
 * and a batch that already has cover data but is missing cover-art.png or
 * cover.pdf on disk (e.g. a human wants to redo the layout with new art).
 */
export async function runCoverBackfill(batchId: string, options: CoverBackfillOptions = {}): Promise<CoverBackfillResult> {
  const batchesDir = options.batchesDir ?? "batches";
  const batchDir = join(batchesDir, batchId);
  const manifestPath = join(batchDir, "manifest.json");

  if (!existsSync(manifestPath)) {
    throw new Error(`No batch found at ${batchDir}.`);
  }

  const manifest = validateManifest(JSON.parse(readFileSync(manifestPath, "utf-8")));
  if (!manifest.bindery) {
    throw new Error(
      `Batch "${batchId}" hasn't been assembled yet (no bindery.interiorPdfPath) — run the normal Etch/Bindery pipeline instead, which already generates the cover as part of assembly.`
    );
  }

  const coverArtPath = manifest.coverArt?.path ?? join(batchDir, COVER_ART_FILENAME);
  let source: "etch" | "human" = manifest.coverArt?.source ?? "human";

  if (!existsSync(coverArtPath)) {
    const coverPrompt = readStoredCoverPrompt(manifest) ?? buildCoverPrompt(manifest.theme);
    const imageClient = options.imageClient ?? new GeminiImageClient();
    await generateCoverArt(imageClient, coverPrompt, coverArtPath);
    source = "etch";
  }

  const backCoverBlurb = manifest.loom?.backCoverBlurbDraft ?? generateBackCoverBlurbDraft(manifest.theme);

  const coverPdfPath = join(batchDir, "cover.pdf");
  await assembleCoverPdf(coverArtPath, backCoverBlurb, manifest.theme, manifest.bindery.pageCount, coverPdfPath);

  const completedAt = new Date().toISOString();
  const updatedCandidate: BatchManifest = {
    ...manifest,
    updatedAt: completedAt,
    coverArt: { path: coverArtPath, addedAt: manifest.coverArt?.addedAt ?? completedAt, source },
    bindery: { ...manifest.bindery, coverPdfPath, completedAt },
  };

  const updated = validateManifest(updatedCandidate);
  writeFileSync(manifestPath, JSON.stringify(updated, null, 2));

  return { batchDir, manifest: updated, coverArtPath, coverPdfPath };
}
