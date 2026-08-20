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
  /** Path to Sentinel's real run-log (see sentinel.yml's "Record Sentinel run" step). Defaults to agents/sentinel/run-log.json. */
  sentinelRunLogPath?: string;
  /** Path to Opportunity Scanner's real run-log. Defaults to agents/opportunity-scanner/run-log.json. */
  opportunityScannerRunLogPath?: string;
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
  opportunityScanner: StageStatus<{ completedAt: string; category: string; contentType: "illustrated" | "text" }>;
  scout: StageStatus<{ completedAt: string; competitionLevel: string }>;
  loom: StageStatus<{ completedAt: string; promptCount: number }>;
  writer: StageStatus<{ completedAt: string; sectionCount: number; wordCount: number; excerpt: string }>;
  images: StageStatus<{ addedAt: string; count: number; source: "etch" | "human" }>;
  coverArt: StageStatus<{ addedAt: string; source: "etch" | "human" }>;
  bindery: StageStatus<{ completedAt: string; pageCount: number }>;
  crier: StageStatus<{ completedAt: string; aiGeneratedDisclosure: true }>;
  published: StageStatus<{
    publishedAt: string;
    asin?: string;
    priceUsd?: number;
    marketplaceUrl?: string;
    sales?: { unitsSold: number; royaltyTotal: number; currency: string; reportPeriodEnd: string; lastUpdated: string };
  }>;
}

export interface InvalidBatch {
  batchId: string;
  error: string;
}

/**
 * Real agent modules from CLAUDE.md's Agents section. Analyst has no
 * producer yet (see CLAUDE.md "Build order") — Ledger honestly reports
 * "not_yet_run" for it until a human uploads a real KDP export. Sentinel
 * is built and reads real data from its own run-log (see
 * sentinelRunLogPath below).
 */
export const AGENT_KEYS = [
  "opportunityScanner",
  "scout",
  "loom",
  "etch",
  "writer",
  "bindery",
  "crier",
  "ledger",
  "sentinel",
  "analyst",
] as const;
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

/**
 * Real, aggregated sales data across every batch's published.sales block —
 * only ever summed from manifest fields that themselves trace back to a
 * parsed KDP report (see Analyst). Currencies are never force-converted or
 * summed together, per CLAUDE.md's no-fabricated-data guardrail: a batch
 * priced in GBP and one in USD stay as two separate totals.
 */
export interface FleetSummary {
  totalRevenueByCurrency: Record<string, number>;
  totalUnitsSold: number;
  /** Count of batches that have at least one real sales report matched to them. */
  batchesWithSalesData: number;
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
  fleet: FleetSummary;
}

function toBatchStatus(manifest: BatchManifest): BatchStatus {
  return {
    batchId: manifest.batchId,
    theme: manifest.theme,
    stage: manifest.stage,
    createdAt: manifest.createdAt,
    updatedAt: manifest.updatedAt,
    opportunityScanner: manifest.opportunityScanner
      ? {
          done: true,
          detail: {
            completedAt: manifest.opportunityScanner.completedAt,
            category: manifest.opportunityScanner.category,
            contentType: manifest.opportunityScanner.contentType,
          },
        }
      : { done: false },
    scout: manifest.scout
      ? { done: true, detail: { completedAt: manifest.scout.completedAt, competitionLevel: manifest.scout.competitionLevel } }
      : { done: false },
    loom: manifest.loom
      ? { done: true, detail: { completedAt: manifest.loom.completedAt, promptCount: manifest.loom.promptCount } }
      : { done: false },
    writer: manifest.writer
      ? {
          done: true,
          detail: {
            completedAt: manifest.writer.completedAt,
            sectionCount: manifest.writer.sectionCount,
            wordCount: manifest.writer.wordCount,
            excerpt: manifest.writer.excerpt,
          },
        }
      : { done: false },
    images: manifest.images
      ? { done: true, detail: { addedAt: manifest.images.addedAt, count: manifest.images.count, source: manifest.images.source } }
      : { done: false },
    coverArt: manifest.coverArt
      ? { done: true, detail: { addedAt: manifest.coverArt.addedAt, source: manifest.coverArt.source } }
      : { done: false },
    bindery: manifest.bindery
      ? { done: true, detail: { completedAt: manifest.bindery.completedAt, pageCount: manifest.bindery.pageCount } }
      : { done: false },
    crier: manifest.crier
      ? { done: true, detail: { completedAt: manifest.crier.completedAt, aiGeneratedDisclosure: true } }
      : { done: false },
    published: manifest.published
      ? {
          done: true,
          detail: {
            publishedAt: manifest.published.publishedAt,
            asin: manifest.published.asin,
            priceUsd: manifest.published.priceUsd,
            marketplaceUrl: manifest.published.marketplaceUrl,
            sales: manifest.published.sales,
          },
        }
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

/** One real Sentinel CI-diagnosis run — written by sentinel.yml's "Record Sentinel run" step, never by Ledger itself. */
export interface SentinelRunLogEntry {
  at: string;
  headSha: string;
  outcome: "patch_applied" | "no_confident_fix" | "error";
  summary: string;
  prUrl?: string;
}

/** Reads Sentinel's real run-log. A missing or unparseable file honestly means "never run", same as an agent with no batch data — never a placeholder. */
function readSentinelRunLog(path: string): SentinelRunLogEntry[] {
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** One real Opportunity Scanner category-selection run — written by agents/opportunity-scanner/index.ts, never by Ledger itself. */
export interface OpportunityScannerRunLogEntry {
  at: string;
  selectedCategory: string;
  contentType: "illustrated" | "text";
  candidateCount: number;
  reportJsonPath: string;
  reportMdPath: string;
}

/** Reads Opportunity Scanner's real run-log. Same honest-empty behavior as readSentinelRunLog. */
function readOpportunityScannerRunLog(path: string): OpportunityScannerRunLogEntry[] {
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Derives each real agent's dashboard-facing activity from the batches
 * Ledger already validated, plus Sentinel's real run-log — never a
 * separate source of truth, and never a fabricated number. Analyst has
 * no run-log of its own; its activity is derived from the real
 * published.sales.lastUpdated timestamps it writes into batch manifests,
 * so it honestly reports not_yet_run/0 until a human uploads a real KDP
 * export that matches at least one batch.
 */
function computeAgentActivity(
  batches: BatchStatus[],
  generatedAt: string,
  sentinelRunLog: SentinelRunLogEntry[],
  opportunityScannerRunLog: OpportunityScannerRunLogEntry[]
): AgentActivity[] {
  const now = new Date(generatedAt);

  const opportunityScannerLast = latestOf(opportunityScannerRunLog.map((e) => e.at));

  const scoutRuns = batches.filter((b) => b.scout.done);
  const scoutLast = latestOf(scoutRuns.map((b) => b.scout.detail?.completedAt));

  const loomRuns = batches.filter((b) => b.loom.done);
  const loomLast = latestOf(loomRuns.map((b) => b.loom.detail?.completedAt));
  const promptsGenerated = loomRuns.reduce((sum, b) => sum + (b.loom.detail?.promptCount ?? 0), 0);

  const etchRuns = batches.filter((b) => b.images.done && b.images.detail?.source === "etch");
  const etchLast = latestOf(etchRuns.map((b) => b.images.detail?.addedAt));
  const imagesGenerated = etchRuns.reduce((sum, b) => sum + (b.images.detail?.count ?? 0), 0);

  const writerRuns = batches.filter((b) => b.writer.done);
  const writerLast = latestOf(writerRuns.map((b) => b.writer.detail?.completedAt));
  const wordsWritten = writerRuns.reduce((sum, b) => sum + (b.writer.detail?.wordCount ?? 0), 0);

  const binderyRuns = batches.filter((b) => b.bindery.done);
  const binderyLast = latestOf(binderyRuns.map((b) => b.bindery.detail?.completedAt));

  const crierRuns = batches.filter((b) => b.crier.done);
  const crierLast = latestOf(crierRuns.map((b) => b.crier.detail?.completedAt));

  const sentinelLast = latestOf(sentinelRunLog.map((e) => e.at));
  const fixPrsDrafted = sentinelRunLog.filter((e) => e.outcome === "patch_applied").length;

  const batchesWithSales = batches.filter((b) => b.published.done && b.published.detail?.sales);
  const analystLast = latestOf(batchesWithSales.map((b) => b.published.detail?.sales?.lastUpdated));

  return [
    {
      agent: "opportunityScanner",
      status: statusFor(opportunityScannerLast, now),
      lastRanAt: opportunityScannerLast,
      metric: { label: "Categories selected", value: opportunityScannerRunLog.length },
    },
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
      agent: "writer",
      status: statusFor(writerLast, now),
      lastRanAt: writerLast,
      metric: { label: "Words written", value: wordsWritten },
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
      status: statusFor(sentinelLast, now),
      lastRanAt: sentinelLast,
      metric: { label: "Fix PRs drafted", value: fixPrsDrafted },
    },
    {
      agent: "analyst",
      status: statusFor(analystLast, now),
      lastRanAt: analystLast,
      metric: { label: "Royalties reported", value: batchesWithSales.length },
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
    if (b.opportunityScanner.done && b.opportunityScanner.detail) {
      events.push({
        at: b.opportunityScanner.detail.completedAt,
        batchId: b.batchId,
        theme: b.theme,
        actor: "opportunityScanner",
        summary: `Opportunity Scanner selected "${b.opportunityScanner.detail.category}" (${b.opportunityScanner.detail.contentType}) for this batch`,
      });
    }
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
    if (b.writer.done && b.writer.detail) {
      events.push({
        at: b.writer.detail.completedAt,
        batchId: b.batchId,
        theme: b.theme,
        actor: "writer",
        summary: `Writer drafted a ${b.writer.detail.wordCount}-word manuscript (${b.writer.detail.sectionCount} sections) for "${b.theme}"`,
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
 * Sums real published.sales.royaltyTotal across every batch, grouped by
 * currency — never force-converted or summed across currencies, per
 * CLAUDE.md's no-fabricated-data guardrail. batchesWithSalesData is an
 * explicit count so the dashboard can render "not yet published" instead
 * of misreading an empty totals map as zero revenue.
 */
/** Rounds a running money total to the nearest cent, so summing many batches' royaltyTotal never drifts into float noise like 44.849999999999994. */
function roundCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function computeFleetSummary(batches: BatchStatus[]): FleetSummary {
  const totalRevenueByCurrency: Record<string, number> = {};
  let totalUnitsSold = 0;
  let batchesWithSalesData = 0;

  for (const b of batches) {
    const sales = b.published.done ? b.published.detail?.sales : undefined;
    if (!sales) continue;
    batchesWithSalesData += 1;
    totalUnitsSold += sales.unitsSold;
    totalRevenueByCurrency[sales.currency] = roundCents((totalRevenueByCurrency[sales.currency] ?? 0) + sales.royaltyTotal);
  }

  return { totalRevenueByCurrency, totalUnitsSold, batchesWithSalesData };
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
  const sentinelRunLogPath = options.sentinelRunLogPath ?? join("agents", "sentinel", "run-log.json");
  const opportunityScannerRunLogPath =
    options.opportunityScannerRunLogPath ?? join("agents", "opportunity-scanner", "run-log.json");

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
    agents: computeAgentActivity(
      batches,
      generatedAt,
      readSentinelRunLog(sentinelRunLogPath),
      readOpportunityScannerRunLog(opportunityScannerRunLogPath)
    ),
    activity: computeActivityFeed(batches),
    fleet: computeFleetSummary(batches),
  };

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(status, null, 2));

  return status;
}
