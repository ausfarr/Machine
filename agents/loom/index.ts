import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { validateManifest, type BatchManifest } from "../../schemas/manifest.ts";
import {
  COMPOSITION_TEMPLATES,
  STYLE_GUIDANCE,
  buildPrompt,
  generateBackMatterDraft,
  generateFrontMatterDraft,
} from "./templates.ts";

const DEFAULT_PROMPT_COUNT = 24;

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
}

export function runLoom(batchId: string, options: LoomRunOptions = {}): LoomRunResult {
  const batchesDir = options.batchesDir ?? "batches";
  const promptCount = options.promptCount ?? DEFAULT_PROMPT_COUNT;

  if (promptCount < 20 || promptCount > 30) {
    throw new Error("Loom prompt count must be between 20 and 30 (KDP low-content batch convention).");
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
      `Batch "${batchId}" is at stage "${existingManifest.stage}", but Loom requires stage "researched". A human must review Scout's report and greenlight this theme before running Loom.`
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
  };

  const frontMatterDraft = generateFrontMatterDraft(theme);
  const backMatterDraft = generateBackMatterDraft(theme);

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
