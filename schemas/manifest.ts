import { z } from "zod";

/**
 * A batch moves through these stages in order as each agent completes its
 * work. Ledger and the dashboard read this field to report real status.
 */
export const BATCH_STAGES = [
  "researched",
  "prompted",
  "manuscripted",
  "imaged",
  "assembled",
  "listed",
  "published",
] as const;

export const BatchStageSchema = z.enum(BATCH_STAGES);
export type BatchStage = z.infer<typeof BatchStageSchema>;

const isoTimestamp = z.string().datetime({ offset: true });

export const ContentTypeSchema = z.enum(["illustrated", "text"]);
export type ContentType = z.infer<typeof ContentTypeSchema>;

/** Which family of composition/style templates Loom uses for an illustrated category. Meaningless (and absent) for contentType "text". */
export const IllustrationStyleSchema = z.enum(["coloring-book", "picture-book"]);
export type IllustrationStyle = z.infer<typeof IllustrationStyleSchema>;

/**
 * Opportunity Scanner's output: the KDP category/format it selected for
 * this batch, grounded in live web_search signal (see CLAUDE.md's
 * Authorized external APIs section). `contentType` is what routes the
 * pipeline to Loom+Etch (illustrated) or Writer (text) downstream;
 * `illustrationStyle` is what routes an illustrated category to the right
 * Loom prompt family (coloring-book page prompts vs. picture-book
 * illustration prompts).
 */
export const OpportunityScannerResultSchema = z.object({
  category: z.string(),
  contentType: ContentTypeSchema,
  illustrationStyle: IllustrationStyleSchema.optional(),
  selectionRationale: z.string(),
  reportJsonPath: z.string(),
  reportMdPath: z.string(),
  completedAt: isoTimestamp,
});
export type OpportunityScannerResult = z.infer<typeof OpportunityScannerResultSchema>;

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

/**
 * Writer's output: a full manuscript for a text-only category (see
 * CLAUDE.md's Writer section). `excerpt` and `proofreadRecommended` exist
 * specifically to be surfaced inline in the pull request — not a separate
 * approval gate, just more visible than an illustrated batch's PR, since
 * this is fully AI-generated prose rather than curated illustrations.
 */
export const WriterResultSchema = z.object({
  manuscriptMdPath: z.string(),
  manuscriptJsonPath: z.string(),
  sectionCount: z.number().int().positive(),
  wordCount: z.number().int().positive(),
  excerpt: z.string(),
  aiGeneratedDisclosure: z.literal(true),
  proofreadRecommended: z.literal(true),
  completedAt: isoTimestamp,
});
export type WriterResult = z.infer<typeof WriterResultSchema>;

/** Set once final images exist in batches/{id}/images/, whether Etch generated them or a human supplied/replaced them. */
export const ImagesResultSchema = z.object({
  folder: z.string(),
  count: z.number().int().positive(),
  addedAt: isoTimestamp,
  source: z.enum(["etch", "human"]),
});
export type ImagesResult = z.infer<typeof ImagesResultSchema>;

/**
 * Set once a front-cover art image exists at batches/{id}/cover-art.png,
 * whether Etch generated it or a human supplied/replaced it. Optional (like
 * ImagesResultSchema) so manifests created before cover generation existed
 * stay valid — Bindery enforces its actual presence operationally rather
 * than this schema retroactively invalidating older batches.
 */
export const CoverArtResultSchema = z.object({
  path: z.string(),
  addedAt: isoTimestamp,
  source: z.enum(["etch", "human"]),
});
export type CoverArtResult = z.infer<typeof CoverArtResultSchema>;

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

/**
 * Set once a real KDP royalty report (uploaded/parsed by a human via
 * Analyst) has been matched to a batch by ASIN. Only ever written from a
 * parsed CSV row — never estimated or fabricated. `lastUpdated` tracks
 * when this block was last merged from a report so a repeat report for
 * the same ASIN updates in place instead of duplicating.
 */
export const SalesResultSchema = z.object({
  unitsSold: z.number().int().nonnegative(),
  royaltyTotal: z.number().nonnegative(),
  currency: z.string().min(1),
  reportPeriodEnd: isoTimestamp,
  lastUpdated: isoTimestamp,
});
export type SalesResult = z.infer<typeof SalesResultSchema>;

/** Set only after a human has published the batch externally. */
export const PublishedResultSchema = z.object({
  publishedAt: isoTimestamp,
  asin: z.string().optional(),
  priceUsd: z.number().nonnegative().optional(),
  marketplaceUrl: z.string().optional(),
  /** Only present once a real KDP report has been matched to this batch's ASIN — never a placeholder. */
  sales: SalesResultSchema.optional(),
});
export type PublishedResult = z.infer<typeof PublishedResultSchema>;

export const BatchManifestSchema = z.object({
  batchId: z.string().min(1),
  stage: BatchStageSchema,
  theme: z.string().min(1),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
  /** Absent for a batch created by directly invoking `npm run scout` on a single theme, bypassing category selection for manual testing. */
  opportunityScanner: OpportunityScannerResultSchema.optional(),
  scout: ScoutResultSchema.optional(),
  loom: LoomResultSchema.optional(),
  writer: WriterResultSchema.optional(),
  images: ImagesResultSchema.optional(),
  coverArt: CoverArtResultSchema.optional(),
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
 *
 * "manuscripted" is the text-only sibling of "prompted"/"imaged" (Writer's
 * output, not Loom/Etch's) — a text batch goes researched -> manuscripted
 * and then waits there for Bindery's manuscript-typesetting mode, same as
 * an illustrated batch waits at "imaged" for image-grid Bindery. Until
 * that mode exists, "assembled"/"listed"/"published" below still only
 * recognize the illustrated (loom+images) path — see CLAUDE.md's Bindery
 * section and its "Build order" v2 phase.
 */
const STAGE_REQUIREMENTS: Record<BatchStage, (keyof BatchManifest)[]> = {
  researched: ["scout"],
  prompted: ["scout", "loom"],
  manuscripted: ["scout", "writer"],
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
