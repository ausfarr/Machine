import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { COVER_ART_FILENAME } from "../agents/etch/index.ts";
import { generateCoverArt } from "../agents/etch/generateCoverArt.ts";
import { GeminiImageClient, type ImageGenClient } from "../agents/etch/geminiClient.ts";
import { buildCoverPrompt } from "../agents/loom/templates.ts";
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
 * Generates cover art for a batch that doesn't have any yet, at any stage —
 * without re-running Scout, Loom, Etch, or Bindery. Works even for a batch
 * that predates cover generation entirely, since it falls back to Loom's
 * own deterministic buildCoverPrompt (which bakes in the same title Crier
 * writes to listing.json), needing only the batch's theme rather than a
 * fresh Loom run. If cover-art.png already exists, it's left alone.
 */
export async function runCoverBackfill(batchId: string, options: CoverBackfillOptions = {}): Promise<CoverBackfillResult> {
  const batchesDir = options.batchesDir ?? "batches";
  const batchDir = join(batchesDir, batchId);
  const manifestPath = join(batchDir, "manifest.json");

  if (!existsSync(manifestPath)) {
    throw new Error(`No batch found at ${batchDir}.`);
  }

  const manifest = validateManifest(JSON.parse(readFileSync(manifestPath, "utf-8")));
  const coverArtPath = manifest.coverArt?.path ?? join(batchDir, COVER_ART_FILENAME);

  let source: "etch" | "human" = manifest.coverArt?.source ?? "human";
  if (!existsSync(coverArtPath)) {
    const coverPrompt = readStoredCoverPrompt(manifest) ?? buildCoverPrompt(manifest.theme);
    const imageClient = options.imageClient ?? new GeminiImageClient();
    await generateCoverArt(imageClient, coverPrompt, coverArtPath);
    source = "etch";
  }

  const completedAt = new Date().toISOString();
  const updatedCandidate: BatchManifest = {
    ...manifest,
    updatedAt: completedAt,
    coverArt: { path: coverArtPath, addedAt: manifest.coverArt?.addedAt ?? completedAt, source },
  };

  const updated = validateManifest(updatedCandidate);
  writeFileSync(manifestPath, JSON.stringify(updated, null, 2));

  return { batchDir, manifest: updated, coverArtPath };
}
