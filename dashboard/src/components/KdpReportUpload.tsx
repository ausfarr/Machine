import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import type { BatchStatus } from "../types";
import type { BatchManifest } from "../../../schemas/manifest";
import { parseKdpReportCsv } from "../../../agents/analyst/kdpReportParser";
import { groupByAsin, mergeSalesIntoManifest } from "../../../agents/analyst/salesMerge";
import { getToken, onTokenChange } from "../lib/githubToken";
import { commitFile, getFile } from "../lib/githubWrite";

interface MatchedPreviewRow {
  asin: string;
  batchId: string;
  theme: string;
  currency: string;
  unitsSold: number;
  royaltyTotal: number;
}
interface UnmatchedPreviewRow {
  asin: string;
  currency: string;
  unitsSold: number;
  royaltyTotal: number;
}
interface AmbiguousPreviewRow {
  asin: string;
  currencies: string[];
}

interface ParsedPreview {
  fileName: string;
  csvText: string;
  matched: MatchedPreviewRow[];
  unmatched: UnmatchedPreviewRow[];
  ambiguous: AmbiguousPreviewRow[];
  totalsByCurrency: Record<string, { unitsSold: number; royaltyTotal: number }>;
  reportPeriodEnd: string | null;
  skippedRowCount: number;
}

type CommitState = { kind: "idle" } | { kind: "committing" } | { kind: "success" } | { kind: "error"; message: string };

/**
 * Parses client-side using the same agents/analyst/kdpReportParser.ts and
 * salesMerge.ts logic the CLI uses (imported directly — see
 * BatchDetailDrawer's precedent importing agents/bindery/kdpSpecs.ts the
 * same way), so a report parses identically whether run via `npm run
 * analyst` or uploaded here.
 */
function buildPreview(fileName: string, csvText: string, batches: BatchStatus[]): ParsedPreview {
  const parsed = parseKdpReportCsv(csvText);
  const batchByAsin = new Map(
    batches.filter((b) => b.published.done && b.published.detail?.asin).map((b) => [b.published.detail!.asin as string, b])
  );

  const matched: MatchedPreviewRow[] = [];
  const unmatched: UnmatchedPreviewRow[] = [];
  const ambiguous: AmbiguousPreviewRow[] = [];

  for (const [asin, aggregates] of groupByAsin(parsed.aggregates)) {
    if (aggregates.length > 1) {
      ambiguous.push({ asin, currencies: aggregates.map((a) => a.currency) });
      continue;
    }
    const agg = aggregates[0]!;
    const batch = batchByAsin.get(asin);
    if (batch) {
      matched.push({ asin, batchId: batch.batchId, theme: batch.theme, currency: agg.currency, unitsSold: agg.unitsSold, royaltyTotal: agg.royaltyTotal });
    } else {
      unmatched.push({ asin, currency: agg.currency, unitsSold: agg.unitsSold, royaltyTotal: agg.royaltyTotal });
    }
  }

  return {
    fileName,
    csvText,
    matched,
    unmatched,
    ambiguous,
    totalsByCurrency: parsed.totalsByCurrency,
    reportPeriodEnd: parsed.reportPeriodEnd,
    skippedRowCount: parsed.skippedRowCount,
  };
}

/**
 * Drag-and-drop / file-picker upload for a real KDP royalty export.
 * Parsing happens entirely client-side and commits nothing — the human
 * reviews the matched/unmatched/ambiguous preview and totals-per-currency
 * before anything is written to GitHub, since this is a real financial
 * data write (CLAUDE.md's no-fabricated-data guardrail applies just as
 * much to what gets committed here as to what the dashboard displays).
 */
export function KdpReportUpload({ batches }: { batches: BatchStatus[] }) {
  const [preview, setPreview] = useState<ParsedPreview | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [hasToken, setHasToken] = useState(() => getToken() !== null);
  const [commitState, setCommitState] = useState<CommitState>({ kind: "idle" });
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => onTokenChange(() => setHasToken(getToken() !== null)), []);

  const handleFile = useCallback(
    async (file: File) => {
      setParseError(null);
      setCommitState({ kind: "idle" });
      if (!file.name.toLowerCase().endsWith(".csv")) {
        setParseError("Please choose a .csv file.");
        return;
      }
      try {
        const text = await file.text();
        setPreview(buildPreview(file.name, text, batches));
      } catch (err) {
        setParseError(err instanceof Error ? err.message : String(err));
        setPreview(null);
      }
    },
    [batches]
  );

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  async function handleConfirm() {
    if (!preview) return;
    const token = getToken();
    if (!token) {
      setCommitState({ kind: "error", message: "Save a GitHub token first (gear icon above)." });
      return;
    }
    setCommitState({ kind: "committing" });

    const isoDate = new Date().toISOString().slice(0, 10);
    const reportPath = `reports/kdp/${isoDate}-${preview.fileName}`;
    const reportPeriodEnd = preview.reportPeriodEnd ?? new Date().toISOString();

    try {
      const csvOutcome = await commitFile(reportPath, preview.csvText, `Analyst: record KDP report ${preview.fileName}`);
      if (csvOutcome.kind !== "success") {
        setCommitState({
          kind: "error",
          message: csvOutcome.kind === "no-token" ? "Save a GitHub token first (gear icon above)." : csvOutcome.message,
        });
        return;
      }

      for (const row of preview.matched) {
        const manifestPath = `batches/${row.batchId}/manifest.json`;
        const file = await getFile(manifestPath, token);
        if (!file) {
          setCommitState({ kind: "error", message: `Couldn't find ${manifestPath} on GitHub.` });
          return;
        }
        const manifest = JSON.parse(file.content) as BatchManifest;
        const { manifest: updated } = mergeSalesIntoManifest(
          manifest,
          { asin: row.asin, currency: row.currency, unitsSold: row.unitsSold, royaltyTotal: row.royaltyTotal },
          reportPeriodEnd,
          new Date().toISOString()
        );
        const outcome = await commitFile(
          manifestPath,
          `${JSON.stringify(updated, null, 2)}\n`,
          `Analyst: record sales for ${row.batchId} (ASIN ${row.asin})`
        );
        if (outcome.kind !== "success") {
          setCommitState({
            kind: "error",
            message: outcome.kind === "no-token" ? "Save a GitHub token first (gear icon above)." : outcome.message,
          });
          return;
        }
      }

      setCommitState({ kind: "success" });
      setPreview(null);
    } catch (err) {
      setCommitState({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  const disabledReason = !hasToken ? "Save a GitHub token first (gear icon above) to upload a report." : null;

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
      <h2 className="text-[11px] font-semibold tracking-[0.2em] text-slate-500">UPLOAD KDP ROYALTY REPORT</h2>
      <p className="mt-1.5 text-xs text-slate-500">
        Upload a KDP royalty report export (.csv). Nothing is committed until you review the preview below and confirm.
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`mt-4 cursor-pointer rounded-lg border-2 border-dashed p-6 text-center text-xs transition-colors ${
          dragActive ? "border-sky-400/60 bg-sky-400/5 text-sky-300" : "border-slate-700 text-slate-500 hover:border-slate-600"
        }`}
      >
        Drag a .csv file here, or click to choose one.
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = "";
          }}
        />
      </div>

      {parseError && <p className="mt-3 text-xs text-red-300">{parseError}</p>}

      {preview && (
        <div className="mt-4 space-y-4 text-xs">
          <p className="text-slate-400">
            Parsed <span className="font-mono text-slate-200">{preview.fileName}</span>
            {preview.skippedRowCount > 0 && <> — {preview.skippedRowCount} row(s) skipped (missing required fields)</>}
          </p>

          <div>
            <p className="font-semibold text-slate-300">Totals in this report</p>
            <ul className="mt-1 space-y-0.5">
              {Object.entries(preview.totalsByCurrency).map(([currency, totals]) => (
                <li key={currency} className="text-slate-400">
                  {totals.unitsSold} units, {totals.royaltyTotal.toFixed(2)} {currency}
                </li>
              ))}
            </ul>
          </div>

          {preview.matched.length > 0 && (
            <div>
              <p className="font-semibold text-emerald-300">Matched {preview.matched.length} batch(es)</p>
              <ul className="mt-1 space-y-1">
                {preview.matched.map((m) => (
                  <li key={m.asin} className="rounded border border-emerald-500/20 bg-emerald-500/5 p-2 text-slate-300">
                    <span className="font-mono text-[10px] text-slate-500">{m.asin}</span> — {m.theme}: {m.unitsSold} units,{" "}
                    {m.royaltyTotal.toFixed(2)} {m.currency}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {preview.ambiguous.length > 0 && (
            <div>
              <p className="font-semibold text-amber-300">
                {preview.ambiguous.length} ASIN(s) sold in more than one currency — not auto-applied, needs a human look
              </p>
              <ul className="mt-1 space-y-1">
                {preview.ambiguous.map((a) => (
                  <li key={a.asin} className="rounded border border-amber-500/20 bg-amber-500/5 p-2 text-slate-300">
                    <span className="font-mono text-[10px] text-slate-500">{a.asin}</span> — {a.currencies.join(", ")}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {preview.unmatched.length > 0 && (
            <div>
              <p className="font-semibold text-slate-400">{preview.unmatched.length} row(s) had no matching batch</p>
              <ul className="mt-1 space-y-1">
                {preview.unmatched.map((u) => (
                  <li key={u.asin} className="rounded border border-slate-700 bg-slate-900/60 p-2 text-slate-400">
                    <span className="font-mono text-[10px] text-slate-500">{u.asin}</span> — {u.unitsSold} units,{" "}
                    {u.royaltyTotal.toFixed(2)} {u.currency}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={Boolean(disabledReason) || commitState.kind === "committing" || preview.matched.length === 0}
              title={disabledReason ?? (preview.matched.length === 0 ? "No matched batches to record." : undefined)}
              className="rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {commitState.kind === "committing" ? "Committing…" : "Confirm and commit"}
            </button>
            {commitState.kind === "success" && <p className="text-emerald-300">Committed — dashboard will update shortly.</p>}
            {commitState.kind === "error" && <p className="text-red-300">{commitState.message}</p>}
          </div>
        </div>
      )}
    </section>
  );
}
