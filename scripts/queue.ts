import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runBindery } from "../agents/bindery/index.ts";
import { AnthropicClaudeClient, type ClaudeClient } from "../agents/scout/claudeClient.ts";
import { runCrier } from "../agents/crier/index.ts";
import { GeminiImageClient, type ImageGenClient } from "../agents/etch/geminiClient.ts";
import { runEtch } from "../agents/etch/index.ts";
import { runLoom } from "../agents/loom/index.ts";
import { runScout } from "../agents/scout/index.ts";
import { selectTheme } from "../agents/scout/themeSelection.ts";

const GENERATED_CANDIDATE_COUNT = 5;

export interface RunPipelineOptions {
  queuePath?: string;
  batchesDir?: string;
  /** Injected for tests; default to real Anthropic/Gemini-backed clients. */
  claudeClient?: ClaudeClient;
  imageClient?: ImageGenClient;
  promptCount?: number;
  /** How many fresh candidates Scout proposes itself, on top of any theme-queue.json entries. Defaults to 5. */
  generatedCandidateCount?: number;
}

export interface RunPipelineResult {
  theme: string;
  batchId: string;
  stage: string;
  selectionRationale: string;
  /** theme-queue.json entries left after this run — human-suggested candidates not selected this time. */
  remainingQueueLength: number;
}

export function readQueue(queuePath: string): string[] {
  if (!existsSync(queuePath)) {
    return [];
  }
  const data = JSON.parse(readFileSync(queuePath, "utf-8"));
  if (!Array.isArray(data) || !data.every((t) => typeof t === "string")) {
    throw new Error(`${queuePath} must be a JSON array of theme strings.`);
  }
  return data;
}

export function writeQueue(queuePath: string, themes: string[]): void {
  writeFileSync(queuePath, JSON.stringify(themes, null, 2) + "\n");
}

/** Themes of every existing batch, so Scout doesn't propose a near-duplicate of one already produced. */
function existingThemes(batchesDir: string): string[] {
  if (!existsSync(batchesDir)) {
    return [];
  }
  const themes: string[] = [];
  for (const entry of readdirSync(batchesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(batchesDir, entry.name, "manifest.json");
    if (!existsSync(manifestPath)) continue;
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
      if (typeof manifest.theme === "string") {
        themes.push(manifest.theme);
      }
    } catch {
      // A broken manifest is Ledger's problem to report; here it just doesn't contribute to the avoid list.
    }
  }
  return themes;
}

/** Merges two theme lists, deduplicating case/whitespace-insensitively, preferring the first list's phrasing. */
function mergeCandidates(primary: string[], secondary: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const theme of [...primary, ...secondary]) {
    const trimmed = theme.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    merged.push(trimmed);
  }
  return merged;
}

/**
 * Runs the whole pipeline unattended, end to end, on one automatically
 * selected theme: Scout generates fresh candidate themes itself via
 * Claude (merged with any human-suggested entries in theme-queue.json,
 * which is now optional rather than a required gate), picks and
 * researches one -> Loom -> Etch (Gemini generates the images) ->
 * Bindery -> Crier. A selected theme is removed from theme-queue.json
 * immediately (if it came from there), so a later failure downstream
 * doesn't cause it to be reselected forever — the batch simply stays at
 * whatever stage it reached, visible to a human via Ledger/the
 * dashboard, and the failure surfaces loudly through the workflow run
 * rather than being swallowed.
 */
export async function runPipelineFromQueue(options: RunPipelineOptions = {}): Promise<RunPipelineResult> {
  const queuePath = options.queuePath ?? "theme-queue.json";
  const batchesDir = options.batchesDir ?? "batches";
  const claudeClient = options.claudeClient ?? new AnthropicClaudeClient();
  const imageClient = options.imageClient ?? new GeminiImageClient();
  const generatedCandidateCount = options.generatedCandidateCount ?? GENERATED_CANDIDATE_COUNT;

  const humanQueue = readQueue(queuePath);
  const generated = await claudeClient.generateCandidateThemes(generatedCandidateCount, existingThemes(batchesDir));
  const pool = mergeCandidates(humanQueue, generated);

  if (pool.length === 0) {
    throw new Error(
      "No candidate themes available: theme-queue.json is empty and Scout's Claude call returned none either."
    );
  }

  const selection = await selectTheme(pool, claudeClient);

  const selectedIndex = humanQueue.findIndex((t) => t.trim().toLowerCase() === selection.selectedTheme.trim().toLowerCase());
  const remainingQueue =
    selectedIndex === -1 ? humanQueue : [...humanQueue.slice(0, selectedIndex), ...humanQueue.slice(selectedIndex + 1)];
  writeQueue(queuePath, remainingQueue);

  const scouted = await runScout(selection.selectedTheme, { batchesDir, claudeClient, selection });
  const loomed = runLoom(scouted.batchId, { batchesDir, promptCount: options.promptCount });
  await runEtch(loomed.manifest.batchId, { batchesDir, imageClient });
  await runBindery(loomed.manifest.batchId, { batchesDir });
  const cried = runCrier(loomed.manifest.batchId, { batchesDir });

  return {
    theme: selection.selectedTheme,
    batchId: scouted.batchId,
    stage: cried.manifest.stage,
    selectionRationale: selection.selectionRationale,
    remainingQueueLength: remainingQueue.length,
  };
}
