import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PROMPT_COUNT } from "../../config.ts";
import { validateManifest, type BatchManifest } from "../../schemas/manifest.ts";
import {
  COMPOSITION_TEMPLATES,
  STYLE_GUIDANCE,
  buildCoverPrompt,
  buildPrompt,
  generateBackCoverBlurbDraft,
  generateBackMatterDraft,
  generateFrontMatterDraft,
} from "./templates.ts";

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
  styleGuidance: string;
  prompts: PromptEntry[];
  cover: { prompt: string };
}

export function runLoom(batchId: string, options: LoomRunOptions = {}): LoomRunResult {
  const batchesDir = options.batchesDir ?? "batches";
  const promptCount = options.promptCount ?? PROMPT_COUNT;

  if (promptCount < 1 || promptCount > 30) {
    throw new Error("Loom prompt count must be between 1 and 30 (30 is the composition template ceiling).");
  }
  if (promptCount > COMPOSITION_TEMPLATES.length) {
    throw new Error(
      `Loom only has ${COMPOSITION_TEMPLATES.length} composition templates, cannot generate ${promptCount} unique prompts.`
    );
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

  const theme = existingManifest.theme;
  const generatedAt = new Date().toISOString();

  const prompts: PromptEntry[] = COMPOSITION_TEMPLATES.slice(0, promptCount).map((template, i) => ({
    index: i + 1,
    prompt: buildPrompt(theme, template),
  }));

  const promptsFile: PromptsFile = {
    batchId,
    theme,
    generatedAt,
    styleGuidance: STYLE_GUIDANCE,
    prompts,
    cover: { prompt: buildCoverPrompt(theme) },
  };

  const frontMatterDraft = generateFrontMatterDraft(theme);
  const backMatterDraft = generateBackMatterDraft(theme);
  const backCoverBlurbDraft = generateBackCoverBlurbDraft(theme);

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
      backCoverBlurbDraft,
      completedAt: generatedAt,
    },
  };

  const manifest = validateManifest(manifestCandidate);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  return { batchDir, manifest, promptsPath, frontBackMatterPath };
}
