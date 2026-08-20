import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PROMPT_COUNT } from "../../config.ts";
import { validateManifest, type BatchManifest, type IllustrationStyle } from "../../schemas/manifest.ts";
import { DEFAULT_ILLUSTRATION_STYLE, ILLUSTRATION_STYLES, buildPrompt } from "./templates.ts";

export interface LoomRunOptions {
  batchesDir?: string;
  promptCount?: number;
}

export interface LoomRunResult {
  batchDir: string;
  manifest: BatchManifest;
  promptsPath: string;
  frontBackMatterPath: string;
}

interface PromptEntry {
  index: number;
  prompt: string;
}

interface PromptsFile {
  batchId: string;
  theme: string;
  generatedAt: string;
  illustrationStyle: IllustrationStyle;
  styleGuidance: string;
  prompts: PromptEntry[];
  cover: { prompt: string; styleGuidance: string };
}

export function runLoom(batchId: string, options: LoomRunOptions = {}): LoomRunResult {
  const batchesDir = options.batchesDir ?? "batches";
  const promptCount = options.promptCount ?? PROMPT_COUNT;

  if (promptCount < 1 || promptCount > 30) {
    throw new Error("Loom prompt count must be between 1 and 30 (30 is the composition template ceiling).");
  }

  const batchDir = join(batchesDir, batchId);
  const manifestPath = join(batchDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`No batch found at ${batchDir} — run Scout first.`);
  }

  const existingManifest = validateManifest(JSON.parse(readFileSync(manifestPath, "utf-8")));
  if (existingManifest.stage !== "researched") {
    throw new Error(
      `Batch "${batchId}" is at stage "${existingManifest.stage}", but Loom requires stage "researched". Run Scout first.`
    );
  }

  // Absent when this batch was created by running `npm run scout` directly
  // on a theme, bypassing Opportunity Scanner — falls back to v1's
  // coloring-book behavior rather than failing a manual test run.
  const illustrationStyle = existingManifest.opportunityScanner?.illustrationStyle ?? DEFAULT_ILLUSTRATION_STYLE;
  const style = ILLUSTRATION_STYLES[illustrationStyle];

  if (promptCount > style.compositionTemplates.length) {
    throw new Error(
      `Loom's "${illustrationStyle}" style only has ${style.compositionTemplates.length} composition templates, cannot generate ${promptCount} unique prompts.`
    );
  }

  const theme = existingManifest.theme;
  const generatedAt = new Date().toISOString();

  const prompts: PromptEntry[] = style.compositionTemplates.slice(0, promptCount).map((template, i) => ({
    index: i + 1,
    prompt: buildPrompt(theme, template),
  }));

  const promptsFile: PromptsFile = {
    batchId,
    theme,
    generatedAt,
    illustrationStyle,
    styleGuidance: style.styleGuidance,
    prompts,
    cover: { prompt: style.buildCoverPrompt(theme), styleGuidance: style.coverStyleGuidance },
  };

  const frontMatterDraft = style.generateFrontMatterDraft(theme);
  const backMatterDraft = style.generateBackMatterDraft(theme);

  const promptsPath = join(batchDir, "prompts.json");
  writeFileSync(promptsPath, JSON.stringify(promptsFile, null, 2));

  const frontBackMatterPath = join(batchDir, "front-back-matter.md");
  writeFileSync(
    frontBackMatterPath,
    `# Front Matter (draft)\n\n${frontMatterDraft}\n\n# Back Matter (draft)\n\n${backMatterDraft}\n\n---\n\nThese are drafts for a human to edit, not final copy.\n`
  );

  const manifestCandidate: BatchManifest = {
    ...existingManifest,
    stage: "prompted",
    updatedAt: generatedAt,
    loom: {
      promptsPath,
      promptCount,
      frontMatterDraft,
      backMatterDraft,
      completedAt: generatedAt,
    },
  };

  const manifest = validateManifest(manifestCandidate);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  return { batchDir, manifest, promptsPath, frontBackMatterPath };
}
