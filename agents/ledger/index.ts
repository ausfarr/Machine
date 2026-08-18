import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  BATCH_STAGES,
  validateManifest,
  type BatchManifest,
  type BatchStage,
} from "../../schemas/manifest.ts";

export interface LedgerRunOptions {
  batchesDir?: string;
  outputPath?: string;
}

export interface StageStatus<T extends Record<string, unknown> = Record<string, never>> {
  done: boolean;
  detail?: T;
}

export interface BatchStatus {
  batchId: string;
  theme: string;
  stage: BatchStage;
  createdAt: string;
  updatedAt: string;
  scout: StageStatus<{ completedAt: string; competitionLevel: string }>;
  loom: StageStatus<{ completedAt: string; promptCount: number }>;
  images: StageStatus<{ addedAt: string; count: number }>;
  bindery: StageStatus<{ completedAt: string; pageCount: number }>;
  crier: StageStatus<{ completedAt: string; aiGeneratedDisclosure: true }>;
  published: StageStatus<{ publishedAt: string }>;
}

export interface InvalidBatch {
  batchId: string;
  error: string;
}

export interface LedgerStatusFile {
  generatedAt: string;
  summary: {
    totalBatches: number;
    invalidBatchCount: number;
    byStage: Record<BatchStage, number>;
  };
  batches: BatchStatus[];
  invalidBatches: InvalidBatch[];
}

function toBatchStatus(manifest: BatchManifest): BatchStatus {
  return {
    batchId: manifest.batchId,
    theme: manifest.theme,
    stage: manifest.stage,
    createdAt: manifest.createdAt,
    updatedAt: manifest.updatedAt,
    scout: manifest.scout
      ? { done: true, detail: { completedAt: manifest.scout.completedAt, competitionLevel: manifest.scout.competitionLevel } }
      : { done: false },
    loom: manifest.loom
      ? { done: true, detail: { completedAt: manifest.loom.completedAt, promptCount: manifest.loom.promptCount } }
      : { done: false },
    images: manifest.images
      ? { done: true, detail: { addedAt: manifest.images.addedAt, count: manifest.images.count } }
      : { done: false },
    bindery: manifest.bindery
      ? { done: true, detail: { completedAt: manifest.bindery.completedAt, pageCount: manifest.bindery.pageCount } }
      : { done: false },
    crier: manifest.crier
      ? { done: true, detail: { completedAt: manifest.crier.completedAt, aiGeneratedDisclosure: true } }
      : { done: false },
    published: manifest.published
      ? { done: true, detail: { publishedAt: manifest.published.publishedAt } }
      : { done: false },
  };
}

/**
 * Reads every batch's manifest.json (the only run-history record this
 * pipeline produces so far — there's no separate agent run-log yet) and
 * writes a status file the dashboard renders. Never invents a number: a
 * batch that hasn't reached a stage is reported as "not done", and a
 * batch whose manifest fails schema validation is reported under
 * invalidBatches with the real validation error, not silently dropped or
 * guessed at.
 */
export function runLedger(options: LedgerRunOptions = {}): LedgerStatusFile {
  const batchesDir = options.batchesDir ?? "batches";
  const outputPath = options.outputPath ?? join("dashboard", "public", "status.json");

  const byStage = Object.fromEntries(BATCH_STAGES.map((s) => [s, 0])) as Record<BatchStage, number>;
  const batches: BatchStatus[] = [];
  const invalidBatches: InvalidBatch[] = [];

  const batchIds = existsSync(batchesDir)
    ? readdirSync(batchesDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    : [];

  for (const batchId of batchIds) {
    const manifestPath = join(batchesDir, batchId, "manifest.json");
    if (!existsSync(manifestPath)) {
      invalidBatches.push({ batchId, error: "no manifest.json found in this batch folder" });
      continue;
    }
    try {
      const manifest = validateManifest(JSON.parse(readFileSync(manifestPath, "utf-8")));
      batches.push(toBatchStatus(manifest));
      byStage[manifest.stage] += 1;
    } catch (err) {
      invalidBatches.push({ batchId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  batches.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const status: LedgerStatusFile = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalBatches: batches.length,
      invalidBatchCount: invalidBatches.length,
      byStage,
    },
    batches,
    invalidBatches,
  };

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(status, null, 2));

  return status;
}
