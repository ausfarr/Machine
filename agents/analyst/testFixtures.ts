import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { validateManifest, type BatchManifest } from "../../schemas/manifest.ts";

/** A fully valid "published" manifest fixture for Analyst tests, avoiding running the whole Scout->Crier chain just to get a publishable batch. */
export function makePublishedManifest(batchId: string, theme: string, asin?: string): BatchManifest {
  const at = "2026-07-01T00:00:00.000Z";
  const candidate = {
    batchId,
    stage: "published" as const,
    theme,
    createdAt: at,
    updatedAt: at,
    scout: {
      reportJsonPath: `batches/${batchId}/research.json`,
      reportMdPath: `batches/${batchId}/research.md`,
      competitionLevel: "low" as const,
      suggestedAngle: "test angle",
      completedAt: at,
    },
    loom: {
      promptsPath: `batches/${batchId}/prompts.json`,
      promptCount: 20,
      frontMatterDraft: "front",
      backMatterDraft: "back",
      completedAt: at,
    },
    images: {
      folder: `batches/${batchId}/images`,
      count: 20,
      addedAt: at,
      source: "etch" as const,
    },
    bindery: {
      interiorPdfPath: `batches/${batchId}/interior.pdf`,
      trimSize: "8.5x11",
      pageCount: 20,
      completedAt: at,
    },
    crier: {
      listingPath: `batches/${batchId}/listing.json`,
      title: theme,
      subtitle: "A coloring book",
      keywords: ["a", "b", "c", "d", "e", "f", "g"],
      categories: ["Coloring Books"],
      aiGeneratedDisclosure: true as const,
      completedAt: at,
    },
    published: {
      publishedAt: at,
      asin,
    },
  };
  return validateManifest(candidate);
}

/** Writes the fixture manifest to batchesDir/batchId/manifest.json and returns its path. */
export function writePublishedBatch(batchesDir: string, batchId: string, theme: string, asin?: string): string {
  const batchDir = join(batchesDir, batchId);
  mkdirSync(batchDir, { recursive: true });
  const manifestPath = join(batchDir, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(makePublishedManifest(batchId, theme, asin), null, 2));
  return manifestPath;
}
