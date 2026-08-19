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
  images: StageStatus<{ addedAt: string; count: number; source: "etch" | "human" }>;
  coverArt: StageStatus<{ addedAt: string; source: "etch" | "human" }>;
  bindery: StageStatus<{ completedAt: string; pageCount: number }>;
  crier: StageStatus<{ completedAt: string; aiGeneratedDisclosure: true }>;
  published: StageStatus<{ publishedAt: string }>;
}

export interface InvalidBatch {
  batchId: string;
  error: string;
}

/** Real agent modules from CLAUDE.md's Agents section, in build order. */
export const AGENT_KEYS = ["scout", "loom", "etch", "bindery", "crier", "ledger", "sentinel", "analyst"] as const;
export type AgentKey = (typeof AGENT_KEYS)[number];

export type AgentRunStatus = "active" | "idle" | "not_yet_run";

export interface AgentActivity {
  agent: AgentKey;
  status: AgentRunStatus;
  lastRanAt: string | null;
  metric: { label: string; value: number };
}

export type ActivityActor = AgentKey | "human";

export interface ActivityEvent {
  at: string;
  batchId: string;
  theme: string;
  actor: ActivityActor;
  summary: string;
}

export interface LedgerStatusFile {
  generatedAt: string;
  summary: {
    totalBatches: number;
    invalidBatchCount: number;
    byStage: Record<BatchStage, number>;
    batchesInProgress: number;
  };
  batches: BatchStatus[];
  invalidBatches: InvalidBatch[];
  agents: AgentActivity[];
  activity: ActivityEvent[];
}
