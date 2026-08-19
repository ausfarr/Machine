/**
 * Pure manifest-merge logic shared by the CLI (agents/analyst/index.ts)
 * and the dashboard's KdpReportUpload.tsx, so both paths update a
 * batch's published.sales block the same way — no fs here either.
 */
import type { BatchManifest } from "../../schemas/manifest.ts";
import type { AsinCurrencyAggregate } from "./kdpReportParser.ts";

export interface SalesMergeResult {
  manifest: BatchManifest;
  update: { asin: string; currency: string; unitsSold: number; royaltyTotal: number };
}

/**
 * Merges one ASIN's parsed report totals into a batch's manifest,
 * replacing any prior sales block for that ASIN (a KDP export is a full
 * cumulative report, not a delta) rather than adding to it — so
 * re-uploading an updated report for the same ASIN reflects the new
 * totals instead of double-counting.
 */
export function mergeSalesIntoManifest(manifest: BatchManifest, aggregate: AsinCurrencyAggregate, reportPeriodEnd: string, now: string): SalesMergeResult {
  if (!manifest.published) {
    throw new Error(`Batch "${manifest.batchId}" has no published.asin set yet — publish it before recording sales.`);
  }

  const merged: BatchManifest = {
    ...manifest,
    updatedAt: now,
    published: {
      ...manifest.published,
      sales: {
        unitsSold: aggregate.unitsSold,
        royaltyTotal: aggregate.royaltyTotal,
        currency: aggregate.currency,
        reportPeriodEnd,
        lastUpdated: now,
      },
    },
  };

  return {
    manifest: merged,
    update: { asin: aggregate.asin, currency: aggregate.currency, unitsSold: aggregate.unitsSold, royaltyTotal: aggregate.royaltyTotal },
  };
}

/**
 * Groups an ASIN's per-currency aggregates so a caller can tell a clean
 * single-currency match from an ASIN that sold in more than one currency
 * in this report. The manifest schema holds one currency per batch, so a
 * multi-currency ASIN can't be merged automatically without either
 * summing or discarding a currency — both forbidden by CLAUDE.md's
 * no-fabricated-data guardrail — so callers should surface those for a
 * human instead of picking one silently.
 */
export function groupByAsin(aggregates: AsinCurrencyAggregate[]): Map<string, AsinCurrencyAggregate[]> {
  const byAsin = new Map<string, AsinCurrencyAggregate[]>();
  for (const agg of aggregates) {
    const list = byAsin.get(agg.asin) ?? [];
    list.push(agg);
    byAsin.set(agg.asin, list);
  }
  return byAsin;
}
