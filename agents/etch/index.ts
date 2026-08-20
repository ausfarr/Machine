import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { MIN_IMAGE_HEIGHT_PX, MIN_IMAGE_WIDTH_PX } from "../bindery/kdpSpecs.ts";
import { validateManifest, type BatchManifest } from "../../schemas/manifest.ts";
import { generateCoverArt } from "./generateCoverArt.ts";
import { GeminiImageClient, type ImageGenClient } from "./geminiClient.ts";

export const COVER_ART_FILENAME = "cover-art.png";

export interface EtchRunOptions {
  batchesDir?: string;
  /** Injected for tests; defaults to a real Gemini-backed client. */
  imageClient?: ImageGenClient;
}

export interface EtchRunResult {
  batchDir: string;
  manifest: BatchManifest;
  imagesDir: string;
  count: number;
}

interface PromptEntry {
  index: number;
  prompt: string;
}

interface PromptsFile {
  batchId: string;
  theme: string;
  styleGuidance: string;
  prompts: PromptEntry[];
  cover: { prompt: string; styleGuidance: string };
}

export async function runEtch(batchId: string, options: EtchRunOptions = {}): Promise<EtchRunResult> {
  const batchesDir = options.batchesDir ?? "batches";
  const imageClient = options.imageClient ?? new GeminiImageClient();

  const batchDir = join(batchesDir, batchId);
  const manifestPath = join(batchDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`No batch found at ${batchDir} — run Scout and Loom first.`);
  }

  const existingManifest = validateManifest(JSON.parse(readFileSync(manifestPath, "utf-8")));
  if (existingManifest.stage !== "prompted") {
    throw new Error(
      `Batch "${batchId}" is at stage "${existingManifest.stage}", but Etch requires stage "prompted". Run Loom first.`
    );
  }

  const promptsPath = existingManifest.loom?.promptsPath;
  if (!promptsPath || !existsSync(promptsPath)) {
    throw new Error(`Batch "${batchId}" manifest has no valid loom.promptsPath — cannot find prompts.json.`);
  }

  const promptsFile: PromptsFile = JSON.parse(readFileSync(promptsPath, "utf-8"));
  if (promptsFile.prompts.length === 0) {
    throw new Error(`Batch "${batchId}": prompts.json has no prompts to generate images for.`);
  }

  const imagesDir = join(batchDir, "images");
  mkdirSync(imagesDir, { recursive: true });

  for (const { index, prompt } of promptsFile.prompts) {
    const fileName = `${String(index).padStart(2, "0")}.png`;
    const fullPrompt = `${promptsFile.styleGuidance}\n\n${prompt}`;

    let raw: Buffer;
    try {
      raw = await imageClient.generateImage(fullPrompt);
    } catch (err) {
      throw new Error(
        `Etch: image generation failed for page ${index} ("${prompt}"): ${err instanceof Error ? err.message : err}`
      );
    }

    try {
      await sharp(raw)
        .resize(MIN_IMAGE_WIDTH_PX, MIN_IMAGE_HEIGHT_PX, { fit: "cover" })
        .png()
        .toFile(join(imagesDir, fileName));
    } catch (err) {
      throw new Error(
        `Etch: could not process Gemini's output for page ${index} into a valid PNG: ${err instanceof Error ? err.message : err}`
      );
    }
  }

  const coverArtPath = join(batchDir, COVER_ART_FILENAME);
  try {
    await generateCoverArt(imageClient, promptsFile.cover.prompt, promptsFile.cover.styleGuidance, coverArtPath);
  } catch (err) {
    throw new Error(`Etch: ${err instanceof Error ? err.message : err}`);
  }

  const completedAt = new Date().toISOString();
  const manifestCandidate: BatchManifest = {
    ...existingManifest,
    stage: "imaged",
    updatedAt: completedAt,
    images: {
      folder: imagesDir,
      count: promptsFile.prompts.length,
      addedAt: completedAt,
      source: "etch",
    },
    coverArt: {
      path: coverArtPath,
      addedAt: completedAt,
      source: "etch",
    },
  };

  const manifest = validateManifest(manifestCandidate);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  return { batchDir, manifest, imagesDir, count: promptsFile.prompts.length };
}
