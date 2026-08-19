import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { validateManifest, type BatchManifest } from "../../schemas/manifest.ts";
import { parseKdpReportCsv, type AsinCurrencyAggregate } from "./kdpReportParser.ts";
import { groupByAsin, mergeSalesIntoManifest } from "./salesMerge.ts";

export interface AnalystRunOptions {
  batchesDir?: string;
  /** Injected for tests; defaults to the real current time. */
  now?: () => string;
}

export interface MatchedUpdate {
  batchId: string;
  theme: string;
  asin: string;
  currency: string;
  unitsSold: number;
  royaltyTotal: number;
}

export interface UnmatchedAsin {
  asin: string;
  currency: string;
  unitsSold: number;
  royaltyTotal: number;
}

export interface AmbiguousAsin {
  asin: string;
  currencies: string[];
}

export interface AnalystRunResult {
  matched: MatchedUpdate[];
  unmatched: UnmatchedAsin[];
  ambiguous: AmbiguousAsin[];
  totalsByCurrency: Record<string, { unitsSold: number; royaltyTotal: number }>;
  reportPeriodEnd: string | null;
  skippedRowCount: number;
  totalRowCount: number;
}

interface BatchEntry {
  batchId: string;
  manifestPath: string;
  manifest: BatchManifest;
}

function loadBatches(batchesDir: string): BatchEntry[] {
  if (!existsSync(batchesDir)) return [];
  const entries: BatchEntry[] = [];
  const batchIds = readdirSync(batchesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  for (const batchId of batchIds) {
    const manifestPath = join(batchesDir, batchId, "manifest.json");
    if (!existsSync(manifestPath)) continue;
    try {
      const manifest = validateManifest(JSON.parse(readFileSync(manifestPath, "utf-8")));
      entries.push({ batchId, manifestPath, manifest });
    } catch {
      // Invalid manifests are Ledger's concern to report; Analyst just can't match against them.
      continue;
    }
  }
  return entries;
}

/**
 * Reads a parsed KDP report and merges matching ASINs' totals into batch
 * manifests on disk. Rows with no matching batch, and ASINs that span
 * more than one currency in this report, are collected and returned
 * rather than silently dropped or guessed at — see salesMerge.ts's
 * groupByAsin for why a multi-currency ASIN can't be auto-merged into
 * the single-currency published.sales block.
 */
export function runAnalyst(csvText: string, options: AnalystRunOptions = {}): AnalystRunResult {
  const batchesDir = options.batchesDir ?? "batches";
  const now = options.now ?? (() => new Date().toISOString());

  const parsed = parseKdpReportCsv(csvText);
  const batches = loadBatches(batchesDir);
  const batchByAsin = new Map<string, BatchEntry>();
  for (const batch of batches) {
    if (batch.manifest.published?.asin) {
      batchByAsin.set(batch.manifest.published.asin, batch);
    }
  }

  const matched: MatchedUpdate[] = [];
  const unmatched: UnmatchedAsin[] = [];
  const ambiguous: AmbiguousAsin[] = [];

  const reportPeriodEnd = parsed.reportPeriodEnd ?? now();

  for (const [asin, aggregates] of groupByAsin(parsed.aggregates)) {
    if (aggregates.length > 1) {
      ambiguous.push({ asin, currencies: aggregates.map((a) => a.currency) });
      continue;
    }
    const aggregate = aggregates[0] as AsinCurrencyAggregate;
    const batch = batchByAsin.get(asin);
    if (!batch) {
      unmatched.push({ asin, currency: aggregate.currency, unitsSold: aggregate.unitsSold, royaltyTotal: aggregate.royaltyTotal });
      continue;
    }

    const { manifest } = mergeSalesIntoManifest(batch.manifest, aggregate, reportPeriodEnd, now());
    const validated = validateManifest(manifest);
    writeFileSync(batch.manifestPath, JSON.stringify(validated, null, 2));

    matched.push({
      batchId: batch.batchId,
      theme: batch.manifest.theme,
      asin,
      currency: aggregate.currency,
      unitsSold: aggregate.unitsSold,
      royaltyTotal: aggregate.royaltyTotal,
    });
  }

  return {
    matched,
    unmatched,
    ambiguous,
    totalsByCurrency: parsed.totalsByCurrency,
    reportPeriodEnd: parsed.reportPeriodEnd,
    skippedRowCount: parsed.skippedRowCount,
    totalRowCount: parsed.totalRowCount,
  };
}
