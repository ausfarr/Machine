import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { runLoom } from "../agents/loom/index.ts";
import { runScout } from "../agents/scout/index.ts";

export interface ProcessQueueOptions {
  queuePath?: string;
  batchesDir?: string;
}

export type ProcessQueueResult =
  | { processed: false }
  | { processed: true; theme: string; batchId: string; stage: string; remainingQueueLength: number };

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
 * Pops the next theme off the queue and runs Scout then Loom on it.
 * Adding a theme to theme-queue.json is the human greenlight this
 * pipeline requires before Loom runs — the same approval Loom's own
 * stage check enforces when a human invokes it directly.
 */
export function processNextQueuedTheme(options: ProcessQueueOptions = {}): ProcessQueueResult {
  const queuePath = options.queuePath ?? "theme-queue.json";
  const batchesDir = options.batchesDir ?? "batches";

  const queue = readQueue(queuePath);
  if (queue.length === 0) {
    return { processed: false };
  }

  const [theme, ...rest] = queue;
  const scouted = runScout(theme!, { batchesDir });
  const loomed = runLoom(scouted.batchId, { batchesDir });

  writeQueue(queuePath, rest);

  return {
    processed: true,
    theme: theme!,
    batchId: scouted.batchId,
    stage: loomed.manifest.stage,
    remainingQueueLength: rest.length,
  };
}
