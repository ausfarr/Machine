import { z } from "zod";

/**
 * A batch moves through these stages in order as each agent completes its
 * work. Ledger and the dashboard read this field to report real status.
 */
export const BATCH_STAGES = [
  "researched",
  "prompted",
  "imaged",
  "assembled",
  "listed",
  "published",
] as const;

export const BatchStageSchema = z.enum(BATCH_STAGES);
export type BatchStage = z.infer<typeof BatchStageSchema>;

const isoTimestamp = z.string().datetime({ offset: true });

/** Scout's output: niche/keyword research on a candidate theme. */
export const ScoutResultSchema = z.object({
  reportJsonPath: z.string(),
  reportMdPath: z.string(),
  competitionLevel: z.enum(["low", "medium", "high"]),
  suggestedAngle: z.string(),
  /** Set when this theme was auto-selected from theme-queue.json rather than run directly on a single theme. */
  selectionRationale: z.string().optional(),
  completedAt: isoTimestamp,
});
export type ScoutResult = z.infer<typeof ScoutResultSchema>;

/** Loom's output: a batch of external-tool image prompts + draft copy. */
export const LoomResultSchema = z.object({
  promptsPath: z.string(),
  promptCount: z.number().int().min(1).max(30),
  frontMatterDraft: z.string(),
  backMatterDraft: z.string(),
  completedAt: isoTimestamp,
});
export type LoomResult = z.infer<typeof LoomResultSchema>;

/** Set once final images exist in batches/{id}/images/, whether Etch generated them or a human supplied/replaced them. */
export const ImagesResultSchema = z.object({
  folder: z.string(),
  count: z.number().int().positive(),
  addedAt: isoTimestamp,
  source: z.enum(["etch", "human"]),
});
export type ImagesResult = z.infer<typeof ImagesResultSchema>;

/** Bindery's output: a validated, print-ready interior PDF. */
export const BinderyResultSchema = z.object({
  interiorPdfPath: z.string(),
  trimSize: z.string(),
  pageCount: z.number().int().positive(),
  completedAt: isoTimestamp,
});
export type BinderyResult = z.infer<typeof BinderyResultSchema>;

/** Crier's output: KDP-ready listing copy, always disclosed as AI-generated. */
export const CrierResultSchema = z.object({
  listingPath: z.string(),
  title: z.string(),
  subtitle: z.string(),
  keywords: z.array(z.string()).length(7),
  categories: z.array(z.string()).min(1),
  aiGeneratedDisclosure: z.literal(true),
  completedAt: isoTimestamp,
});
export type CrierResult = z.infer<typeof CrierResultSchema>;

/** Set only after a human has published the batch externally. */
export const PublishedResultSchema = z.object({
  publishedAt: isoTimestamp,
  asin: z.string().optional(),
});
export type PublishedResult = z.infer<typeof PublishedResultSchema>;

export const BatchManifestSchema = z.object({
  batchId: z.string().min(1),
  stage: BatchStageSchema,
  theme: z.string().min(1),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
  scout: ScoutResultSchema.optional(),
  loom: LoomResultSchema.optional(),
  images: ImagesResultSchema.optional(),
  bindery: BinderyResultSchema.optional(),
  crier: CrierResultSchema.optional(),
  published: PublishedResultSchema.optional(),
});
export type BatchManifest = z.infer<typeof BatchManifestSchema>;

/**
 * Stage order must match how far the batch has actually progressed —
 * e.g. stage "assembled" requires scout, loom, images, and bindery to all
 * be present. Catches a manifest that claims a stage without the work
 * behind it, per the "no fabricated data" guardrail.
 */
const STAGE_REQUIREMENTS: Record<BatchStage, (keyof BatchManifest)[]> = {
  researched: ["scout"],
  prompted: ["scout", "loom"],
  imaged: ["scout", "loom", "images"],
  assembled: ["scout", "loom", "images", "bindery"],
  listed: ["scout", "loom", "images", "bindery", "crier"],
  published: ["scout", "loom", "images", "bindery", "crier", "published"],
};

export function validateManifest(data: unknown): BatchManifest {
  const manifest = BatchManifestSchema.parse(data);
  const required = STAGE_REQUIREMENTS[manifest.stage];
  const missing = required.filter((field) => manifest[field] === undefined);
  if (missing.length > 0) {
    throw new Error(
      `manifest claims stage "${manifest.stage}" but is missing required field(s): ${missing.join(", ")}`
    );
  }
  return manifest;
}
