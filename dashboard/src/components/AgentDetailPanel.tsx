import type { AgentActivity, AgentKey, BatchStatus, LedgerStatusFile } from "../types";
import { PERSONA_BY_AGENT } from "../personas";
import { StatusPill } from "./StatusPill";
import { assetUrl, formatDate, formatRelative } from "../lib/format";

/** Whether a given agent's real work appears on this batch — mirrors Ledger's own per-agent filters. */
function agentTouchedBatch(agent: AgentKey, batch: BatchStatus): boolean {
  switch (agent) {
    case "opportunityScanner":
      return batch.opportunityScanner.done;
    case "scout":
      return batch.scout.done;
    case "loom":
      return batch.loom.done;
    case "etch":
      return batch.images.done && batch.images.detail?.source === "etch";
    case "bindery":
      return batch.bindery.done;
    case "crier":
      return batch.crier.done;
    case "ledger":
      return true;
    case "analyst":
      return Boolean(batch.published.done && batch.published.detail?.sales);
    case "sentinel":
      return false;
  }
}

export function AgentDetailPanel({
  agent,
  activity,
  status,
  onClose,
}: {
  agent: AgentKey;
  activity: AgentActivity;
  status: LedgerStatusFile;
  onClose: () => void;
}) {
  const persona = PERSONA_BY_AGENT[agent];
  const touchedBatches = status.batches.filter((b) => agentTouchedBatch(agent, b));
  const events = status.activity.filter((e) => e.actor === agent);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-10" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-xl border border-slate-800 bg-slate-950 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <img
              src={assetUrl(persona.portrait)}
              alt={`${persona.personaName} portrait`}
              className="h-16 w-16 rounded-full border-2 object-cover"
              style={{ borderColor: persona.accent }}
            />
            <div>
              <h2 className="text-lg font-bold text-slate-100">{persona.personaName}</h2>
              <p className="text-xs text-slate-500">{persona.subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-700 px-2.5 py-1 text-xs text-slate-400 hover:bg-slate-800"
          >
            Close
          </button>
        </div>

        <p className="mt-4 text-sm italic text-slate-400">&ldquo;{persona.tagline}&rdquo;</p>

        <div className="mt-5 flex flex-wrap items-center gap-4">
          <StatusPill status={activity.status} />
          <p className="text-sm text-slate-400">
            {activity.lastRanAt ? `Last ran ${formatRelative(activity.lastRanAt)} (${formatDate(activity.lastRanAt)})` : "Never run"}
          </p>
        </div>

        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-2xl font-bold text-slate-100">{activity.metric.value.toLocaleString()}</p>
          <p className="text-xs text-slate-500">{activity.metric.label}</p>
        </div>

        <div className="mt-6">
          <h3 className="text-[11px] font-semibold tracking-[0.2em] text-slate-500">RUN HISTORY</h3>
          {events.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No runs recorded yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {events.map((event, i) => (
                <li key={`${event.batchId}-${event.at}-${i}`} className="text-sm text-slate-300">
                  <span className="text-slate-600">{formatRelative(event.at)} &middot; </span>
                  {event.summary}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-6">
          <h3 className="text-[11px] font-semibold tracking-[0.2em] text-slate-500">BATCHES TOUCHED</h3>
          {touchedBatches.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No batches yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {touchedBatches.map((b) => (
                <li key={b.batchId} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-slate-300">{b.theme}</span>
                  <span className="font-mono text-[11px] text-slate-600">{b.batchId}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
