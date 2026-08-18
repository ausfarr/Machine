/** Mirrors agents/ledger/index.ts's LedgerStatusFile — keep in sync. */

export type BatchStage = "researched" | "prompted" | "imaged" | "assembled" | "listed" | "published";

export const BATCH_STAGES: BatchStage[] = ["researched", "prompted", "imaged", "assembled", "listed", "published"];

export interface StageStatus<T = Record<string, unknown>> {
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
