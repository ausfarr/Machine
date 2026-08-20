import sharp from "sharp";
import { MIN_IMAGE_HEIGHT_PX, MIN_IMAGE_WIDTH_PX } from "../bindery/kdpSpecs.ts";
import type { ImageGenClient } from "./geminiClient.ts";

/**
 * Generates one front-cover art image via the given Gemini-backed client and
 * writes it to outputPath. Shared by Etch's full pipeline run and the
 * standalone cover-backfill script (scripts/generate-cover-for-batch.ts), so
 * both use the exact same prompt-composition and resize logic. Takes
 * coverStyleGuidance as a parameter rather than importing it from Loom —
 * Etch is a generic image executor for any illustrated category (see
 * CLAUDE.md's Etch section) and has no coloring-book-specific (or any
 * other style-specific) logic of its own.
 */
export async function generateCoverArt(
  imageClient: ImageGenClient,
  coverPrompt: string,
  coverStyleGuidance: string,
  outputPath: string
): Promise<void> {
  const fullPrompt = `${coverStyleGuidance}\n\n${coverPrompt}`;

  let raw: Buffer;
  try {
    raw = await imageClient.generateImage(fullPrompt);
  } catch (err) {
    throw new Error(`Cover art generation failed: ${err instanceof Error ? err.message : err}`);
  }

  try {
    await sharp(raw)
      .resize(MIN_IMAGE_WIDTH_PX, MIN_IMAGE_HEIGHT_PX, { fit: "cover" })
      .png()
      .toFile(outputPath);
  } catch (err) {
    throw new Error(`Could not process Gemini's cover output into a valid PNG: ${err instanceof Error ? err.message : err}`);
  }
}
