import type { LedgerStatusFile } from "../types";
import { formatDate, formatRelative } from "../lib/format";
import { GithubTokenSettings } from "./GithubTokenSettings";

/**
 * Live when any *content-producing* agent has run within Ledger's active
 * window. Ledger itself is excluded — it's "active" on every run by
 * definition (it just ran to produce this status), so including it would
 * make this always say LIVE regardless of real pipeline activity.
 */
function isPipelineLive(status: LedgerStatusFile): boolean {
  return status.agents.some((a) => a.agent !== "ledger" && a.status === "active");
}

export function Header({
  status,
  lastSyncedAt,
  pulseKey,
}: {
  status: LedgerStatusFile;
  /** Real timestamp of this browser's last successful status.json poll. */
  lastSyncedAt: string | null;
  /** Bumped only when status.generatedAt actually changes between polls — remounts the badge to replay its flash animation. */
  pulseKey: number;
}) {
  const live = isPipelineLive(status);

  return (
    <header className="border-b border-slate-800/80 pb-6">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.2em] text-slate-500">MISSION CONTROL</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-100">Coloring Book Pipeline</h1>
          <p className="mt-1 text-sm text-slate-500">
            Real pipeline status, read directly from Ledger — nothing here is fabricated or placeholder data.
          </p>
        </div>

        <div className="flex items-center gap-8">
          <div className="text-right">
            <p className="text-[11px] font-semibold tracking-wide text-slate-500">BATCHES IN PROGRESS</p>
            <p className="text-3xl font-bold text-slate-100">{status.summary.batchesInProgress}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-semibold tracking-wide text-slate-500">TOTAL TRACKED</p>
            <p className="text-3xl font-bold text-slate-100">{status.summary.totalBatches}</p>
          </div>
          <span
            key={pulseKey}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold tracking-wide ${
              live
                ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                : "border-slate-600/60 bg-slate-800/60 text-slate-400"
            } ${pulseKey > 0 ? "animate-badge-flash" : ""}`}
            title={
              live
                ? "At least one agent has run within the pipeline's weekly cadence window."
                : "No agent has run within the pipeline's weekly cadence window."
            }
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                live ? "bg-emerald-400 shadow-[0_0_6px_2px_rgba(52,211,153,0.7)]" : "bg-slate-500"
              }`}
              aria-hidden="true"
            />
            {live ? "LIVE" : "IDLE"}
          </span>
          <GithubTokenSettings />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end gap-3 text-xs text-slate-600">
        {lastSyncedAt && <span>Synced {formatRelative(lastSyncedAt)}</span>}
        <span>Status generated {formatDate(status.generatedAt)}</span>
      </div>
    </header>
  );
}
