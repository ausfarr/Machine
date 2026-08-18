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
  images: StageStatus<{ addedAt: string; count: number; source: "etch" | "human" }>;
  bindery: StageStatus<{ completedAt: string; pageCount: number }>;
  crier: StageStatus<{ completedAt: string; aiGeneratedDisclosure: true }>;
  published: StageStatus<{ publishedAt: string }>;
}

export interface InvalidBatch {
  batchId: string;
  error: string;
}

/**
 * Real agent modules from CLAUDE.md's Agents section. Sentinel and
 * Analyst are documented there but not built yet (see CLAUDE.md "Build
 * order") — Ledger still lists them, honestly reporting "not_yet_run"
 * until they exist and produce real data to read.
 */
export const AGENT_KEYS = ["scout", "loom", "etch", "bindery", "crier", "ledger", "sentinel", "analyst"] as const;
export type AgentKey = (typeof AGENT_KEYS)[number];

export type AgentRunStatus = "active" | "idle" | "not_yet_run";

export interface AgentActivity {
  agent: AgentKey;
  status: AgentRunStatus;
  /** Most recent real timestamp this agent's work appears in any batch manifest, or null if it has never run. */
  lastRanAt: string | null;
  /** One real, computed metric — never a placeholder. */
  metric: { label: string; value: number };
}

/**
 * A batch stage's real timestamp counts as "active" if it falls within
 * this window of Ledger's own run time. The scheduled pipeline runs
 * weekly (see CLAUDE.md "Tech stack"), so the window is set to 8 days —
 * a week plus a 1-day buffer for a late run — rather than an arbitrary
 * short window that would mislabel a healthy weekly cadence as idle.
 */
const ACTIVE_WINDOW_MS = 8 * 24 * 60 * 60 * 1000;

/** A human, alongside the real agents, since CLAUDE.md explicitly allows human intervention (supplying images, publishing) at points no agent is authorized to act. */
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
    /** totalBatches minus batches already at "published" — batches still moving through the pipeline. */
    batchesInProgress: number;
  };
  batches: BatchStatus[];
  invalidBatches: InvalidBatch[];
  agents: AgentActivity[];
  /** Real, timestamped events drawn from batch manifests, newest first. */
  activity: ActivityEvent[];
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
      ? { done: true, detail: { addedAt: manifest.images.addedAt, count: manifest.images.count, source: manifest.images.source } }
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

/** Latest of a set of real ISO timestamps, or null if none are present. Compares by actual instant, not string order, so mixed UTC offsets sort correctly. */
function latestOf(timestamps: (string | undefined)[]): string | null {
  const present = timestamps.filter((t): t is string => Boolean(t));
  if (present.length === 0) return null;
  return present.reduce((latest, t) => (new Date(t) > new Date(latest) ? t : latest));
}

function statusFor(lastRanAt: string | null, now: Date): AgentRunStatus {
  if (!lastRanAt) return "not_yet_run";
  return now.getTime() - new Date(lastRanAt).getTime() <= ACTIVE_WINDOW_MS ? "active" : "idle";
}

/**
 * Derives each real agent's dashboard-facing activity from the batches
 * Ledger already validated — never a separate source of truth, and never
 * a fabricated number. Sentinel and Analyst have no producer yet (see
 * CLAUDE.md "Build order"), so they honestly report not_yet_run/0 until
 * they exist and write real data somewhere Ledger can read.
 */
function computeAgentActivity(batches: BatchStatus[], generatedAt: string): AgentActivity[] {
  const now = new Date(generatedAt);

  const scoutRuns = batches.filter((b) => b.scout.done);
  const scoutLast = latestOf(scoutRuns.map((b) => b.scout.detail?.completedAt));

  const loomRuns = batches.filter((b) => b.loom.done);
  const loomLast = latestOf(loomRuns.map((b) => b.loom.detail?.completedAt));
  const promptsGenerated = loomRuns.reduce((sum, b) => sum + (b.loom.detail?.promptCount ?? 0), 0);

  const etchRuns = batches.filter((b) => b.images.done && b.images.detail?.source === "etch");
  const etchLast = latestOf(etchRuns.map((b) => b.images.detail?.addedAt));
  const imagesGenerated = etchRuns.reduce((sum, b) => sum + (b.images.detail?.count ?? 0), 0);

  const binderyRuns = batches.filter((b) => b.bindery.done);
  const binderyLast = latestOf(binderyRuns.map((b) => b.bindery.detail?.completedAt));

  const crierRuns = batches.filter((b) => b.crier.done);
  const crierLast = latestOf(crierRuns.map((b) => b.crier.detail?.completedAt));

  return [
    {
      agent: "scout",
      status: statusFor(scoutLast, now),
      lastRanAt: scoutLast,
      metric: { label: "Themes researched", value: scoutRuns.length },
    },
    {
      agent: "loom",
      status: statusFor(loomLast, now),
      lastRanAt: loomLast,
      metric: { label: "Prompts generated", value: promptsGenerated },
    },
    {
      agent: "etch",
      status: statusFor(etchLast, now),
      lastRanAt: etchLast,
      metric: { label: "Images generated", value: imagesGenerated },
    },
    {
      agent: "bindery",
      status: statusFor(binderyLast, now),
      lastRanAt: binderyLast,
      metric: { label: "Interiors assembled", value: binderyRuns.length },
    },
    {
      agent: "crier",
      status: statusFor(crierLast, now),
      lastRanAt: crierLast,
      metric: { label: "Listings written", value: crierRuns.length },
    },
    {
      agent: "ledger",
      status: "active",
      lastRanAt: generatedAt,
      metric: { label: "Batches tracked", value: batches.length },
    },
    {
      agent: "sentinel",
      status: "not_yet_run",
      lastRanAt: null,
      metric: { label: "Fix PRs drafted", value: 0 },
    },
    {
      agent: "analyst",
      status: "not_yet_run",
      lastRanAt: null,
      metric: { label: "Royalties reported", value: 0 },
    },
  ];
}

/**
 * Flattens each batch's real per-stage timestamps into a chronological
 * event feed. Every event traces to a field already validated on that
 * batch's manifest — nothing here is invented. PR/CI events aren't
 * included because no agent or workflow writes that data anywhere yet
 * (Sentinel and the step-7 GitHub Actions workflows don't exist); add
 * them here once something produces a real, readable record.
 */
function computeActivityFeed(batches: BatchStatus[]): ActivityEvent[] {
  const events: ActivityEvent[] = [];

  for (const b of batches) {
    if (b.scout.done && b.scout.detail) {
      events.push({
        at: b.scout.detail.completedAt,
        batchId: b.batchId,
        theme: b.theme,
        actor: "scout",
        summary: `Scout researched "${b.theme}" (competition: ${b.scout.detail.competitionLevel})`,
      });
    }
    if (b.loom.done && b.loom.detail) {
      events.push({
        at: b.loom.detail.completedAt,
        batchId: b.batchId,
        theme: b.theme,
        actor: "loom",
        summary: `Loom wrote ${b.loom.detail.promptCount} image prompts for "${b.theme}"`,
      });
    }
    if (b.images.done && b.images.detail) {
      const bySource = b.images.detail.source === "etch" ? "etch" : "human";
      const verb = bySource === "etch" ? "Etch generated" : "A human supplied";
      events.push({
        at: b.images.detail.addedAt,
        batchId: b.batchId,
        theme: b.theme,
        actor: bySource,
        summary: `${verb} ${b.images.detail.count} image(s) for "${b.theme}"`,
      });
    }
    if (b.bindery.done && b.bindery.detail) {
      events.push({
        at: b.bindery.detail.completedAt,
        batchId: b.batchId,
        theme: b.theme,
        actor: "bindery",
        summary: `Bindery assembled a ${b.bindery.detail.pageCount}-page interior for "${b.theme}"`,
      });
    }
    if (b.crier.done && b.crier.detail) {
      events.push({
        at: b.crier.detail.completedAt,
        batchId: b.batchId,
        theme: b.theme,
        actor: "crier",
        summary: `Crier wrote the KDP listing copy for "${b.theme}"`,
      });
    }
    if (b.published.done && b.published.detail) {
      events.push({
        at: b.published.detail.publishedAt,
        batchId: b.batchId,
        theme: b.theme,
        actor: "human",
        summary: `"${b.theme}" was published`,
      });
    }
  }

  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return events;
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

  const generatedAt = new Date().toISOString();

  const status: LedgerStatusFile = {
    generatedAt,
    summary: {
      totalBatches: batches.length,
      invalidBatchCount: invalidBatches.length,
      byStage,
      batchesInProgress: batches.length - byStage.published,
    },
    batches,
    invalidBatches,
    agents: computeAgentActivity(batches, generatedAt),
    activity: computeActivityFeed(batches),
  };

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(status, null, 2));

  return status;
}
