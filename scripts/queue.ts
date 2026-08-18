import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { runBindery } from "../agents/bindery/index.ts";
import { AnthropicClaudeClient, type ClaudeClient } from "../agents/scout/claudeClient.ts";
import { runCrier } from "../agents/crier/index.ts";
import { GeminiImageClient, type ImageGenClient } from "../agents/etch/geminiClient.ts";
import { runEtch } from "../agents/etch/index.ts";
import { runLoom } from "../agents/loom/index.ts";
import { runScout } from "../agents/scout/index.ts";
import { selectTheme } from "../agents/scout/themeSelection.ts";

export interface RunPipelineOptions {
  queuePath?: string;
  batchesDir?: string;
  /** Injected for tests; default to real Anthropic/Gemini-backed clients. */
  claudeClient?: ClaudeClient;
  imageClient?: ImageGenClient;
  promptCount?: number;
}

export type RunPipelineResult =
  | { processed: false }
  | {
      processed: true;
      theme: string;
      batchId: string;
      stage: string;
      selectionRationale: string;
      remainingQueueLength: number;
    };

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

/**
 * Runs the whole pipeline unattended, end to end, on one automatically
 * selected theme: Scout (Claude picks + researches a theme from the
 * queue) -> Loom -> Etch (Gemini generates the images) -> Bindery ->
 * Crier. The queue entry is consumed as soon as a theme is selected, so a
 * later failure downstream doesn't cause the same theme to be reselected
 * forever — the batch simply stays at whatever stage it reached, visible
 * to a human via Ledger/the dashboard, and the failure surfaces loudly
 * through the workflow run rather than being swallowed.
 */
export async function runPipelineFromQueue(options: RunPipelineOptions = {}): Promise<RunPipelineResult> {
  const queuePath = options.queuePath ?? "theme-queue.json";
  const batchesDir = options.batchesDir ?? "batches";
  const claudeClient = options.claudeClient ?? new AnthropicClaudeClient();
  const imageClient = options.imageClient ?? new GeminiImageClient();

  const queue = readQueue(queuePath);
  if (queue.length === 0) {
    return { processed: false };
  }

  const selection = await selectTheme(queue, claudeClient);

  const selectedIndex = queue.findIndex((t) => t.trim().toLowerCase() === selection.selectedTheme.trim().toLowerCase());
  const remaining = [...queue.slice(0, selectedIndex), ...queue.slice(selectedIndex + 1)];
  writeQueue(queuePath, remaining);

  const scouted = await runScout(selection.selectedTheme, { batchesDir, claudeClient, selection });
  const loomed = runLoom(scouted.batchId, { batchesDir, promptCount: options.promptCount });
  await runEtch(loomed.manifest.batchId, { batchesDir, imageClient });
  await runBindery(loomed.manifest.batchId, { batchesDir });
  const cried = runCrier(loomed.manifest.batchId, { batchesDir });

  return {
    processed: true,
    theme: selection.selectedTheme,
    batchId: scouted.batchId,
    stage: cried.manifest.stage,
    selectionRationale: selection.selectionRationale,
    remainingQueueLength: remaining.length,
  };
}
