import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { validateManifest, type BatchManifest } from "../../schemas/manifest.ts";
import {
  AI_DISCLOSURE_NOTE,
  CATEGORY_NOTE,
  DEFAULT_CATEGORIES,
  buildDescription,
  buildKeywords,
  buildSubtitle,
  buildTitle,
} from "./templates.ts";

export interface CrierRunOptions {
  batchesDir?: string;
}

export interface CrierRunResult {
  batchDir: string;
  manifest: BatchManifest;
  listingPath: string;
}

interface ListingFile {
  batchId: string;
  theme: string;
  generatedAt: string;
  title: string;
  subtitle: string;
  keywords: string[];
  categories: string[];
  categoryNote: string;
  description: string;
  aiGeneratedDisclosure: true;
  disclosureNote: string;
}

export function runCrier(batchId: string, options: CrierRunOptions = {}): CrierRunResult {
  const batchesDir = options.batchesDir ?? "batches";
  const batchDir = join(batchesDir, batchId);
  const manifestPath = join(batchDir, "manifest.json");

  if (!existsSync(manifestPath)) {
    throw new Error(`No batch found at ${batchDir} — run Scout, Loom, and Bindery first.`);
  }

  const existingManifest = validateManifest(JSON.parse(readFileSync(manifestPath, "utf-8")));
  if (existingManifest.stage !== "assembled") {
    throw new Error(
      `Batch "${batchId}" is at stage "${existingManifest.stage}", but Crier requires stage "assembled". Run Bindery first.`
    );
  }

  const theme = existingManifest.theme;
  const pageCount = existingManifest.bindery?.pageCount;
  const suggestedAngle = existingManifest.scout?.suggestedAngle;
  if (!pageCount || !suggestedAngle) {
    throw new Error(`Batch "${batchId}" manifest is missing bindery.pageCount or scout.suggestedAngle.`);
  }

  const illustrationStyle = existingManifest.opportunityScanner?.illustrationStyle;

  const generatedAt = new Date().toISOString();
  const title = buildTitle(theme, illustrationStyle);
  const subtitle = buildSubtitle(theme, pageCount, illustrationStyle);
  const keywords = buildKeywords(theme);
  const description = buildDescription(theme, pageCount, suggestedAngle);

  const listing: ListingFile = {
    batchId,
    theme,
    generatedAt,
    title,
    subtitle,
    keywords,
    categories: DEFAULT_CATEGORIES,
    categoryNote: CATEGORY_NOTE,
    description,
    aiGeneratedDisclosure: true,
    disclosureNote: AI_DISCLOSURE_NOTE,
  };

  const listingPath = join(batchDir, "listing.json");
  writeFileSync(listingPath, JSON.stringify(listing, null, 2));

  const manifestCandidate: BatchManifest = {
    ...existingManifest,
    stage: "listed",
    updatedAt: generatedAt,
    crier: {
      listingPath,
      title,
      subtitle,
      keywords,
      categories: DEFAULT_CATEGORIES,
      aiGeneratedDisclosure: true,
      completedAt: generatedAt,
    },
  };

  const manifest = validateManifest(manifestCandidate);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  return { batchDir, manifest, listingPath };
}
