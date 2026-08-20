import type { BatchStage, BatchStatus } from "../types";
import { formatDate } from "../lib/format";

export const STAGE_LABELS: Record<BatchStage, string> = {
  researched: "Researched",
  prompted: "Prompted",
  manuscripted: "Manuscripted",
  imaged: "Imaged",
  assembled: "Assembled",
  listed: "Listed",
  published: "Published",
};

export const STAGE_BADGE_CLASSES: Record<BatchStage, string> = {
  researched: "border-slate-600/50 bg-slate-700/40 text-slate-200",
  prompted: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  manuscripted: "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300",
  imaged: "border-indigo-500/40 bg-indigo-500/10 text-indigo-300",
  assembled: "border-violet-500/40 bg-violet-500/10 text-violet-300",
  listed: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  published: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
};

/**
 * A batch is either illustrated (loom/images/coverArt) or text-only
 * (writer) — never both — so this list includes every possible step
 * across both paths; a given batch's card just shows the ones that
 * apply to it as done, the rest as not-yet (see PIPELINE_STEPS filtering
 * in BatchCard below).
 */
const PIPELINE_STEPS: {
  key: keyof Pick<BatchStatus, "scout" | "loom" | "images" | "coverArt" | "writer" | "bindery" | "crier" | "published">;
  label: string;
}[] = [
  { key: "scout", label: "Scout" },
  { key: "loom", label: "Loom" },
  { key: "images", label: "Images" },
  { key: "coverArt", label: "Cover" },
  { key: "writer", label: "Writer" },
  { key: "bindery", label: "Bindery" },
  { key: "crier", label: "Crier" },
  { key: "published", label: "Published" },
];

const ILLUSTRATED_ONLY_STEPS = new Set<(typeof PIPELINE_STEPS)[number]["key"]>(["loom", "images", "coverArt"]);
const TEXT_ONLY_STEPS = new Set<(typeof PIPELINE_STEPS)[number]["key"]>(["writer"]);

/**
 * Hides the steps that don't apply to this batch's content type, so a
 * text-only batch doesn't show permanently-off Loom/Images/Cover dots (and
 * vice versa) — cosmetic only, never affects the real `done` data itself.
 * Falls back to showing every step when contentType isn't known yet (a
 * batch predating Opportunity Scanner, or one whose opportunityScanner
 * step hasn't completed), so nothing appears to vanish mid-run.
 */
function visiblePipelineSteps(batch: BatchStatus) {
  const contentType = batch.opportunityScanner.detail?.contentType;
  if (contentType === "illustrated") {
    return PIPELINE_STEPS.filter((s) => !TEXT_ONLY_STEPS.has(s.key));
  }
  if (contentType === "text") {
    return PIPELINE_STEPS.filter((s) => !ILLUSTRATED_ONLY_STEPS.has(s.key));
  }
  return PIPELINE_STEPS;
}

function BatchCard({ batch, onSelect }: { batch: BatchStatus; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-left transition hover:border-slate-600 hover:bg-slate-900"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">{batch.theme}</h3>
          <p className="mt-0.5 font-mono text-[11px] text-slate-600">{batch.batchId}</p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-wide ${STAGE_BADGE_CLASSES[batch.stage]}`}>
          {STAGE_LABELS[batch.stage]}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {visiblePipelineSteps(batch).map(({ key, label }) => (
          <div key={key} className="flex items-center gap-1.5 text-xs">
            <span className={`h-1.5 w-1.5 rounded-full ${batch[key].done ? "bg-emerald-400" : "bg-slate-700"}`} aria-hidden="true" />
            <span className={batch[key].done ? "text-slate-300" : "text-slate-600"}>{label}</span>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[11px] text-slate-600">
        Created {formatDate(batch.createdAt)} &middot; Updated {formatDate(batch.updatedAt)}
      </p>
    </button>
  );
}

export function BatchList({ batches, onSelect }: { batches: BatchStatus[]; onSelect: (batchId: string) => void }) {
  return (
    <section>
      <h2 className="text-[11px] font-semibold tracking-[0.2em] text-slate-500">BATCHES</h2>
      {batches.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-slate-800 p-8 text-center">
          <p className="text-slate-300">No batches yet.</p>
          <p className="mt-1 text-sm text-slate-500">
            Run <code className="font-mono">npm run scout -- "a theme"</code> to research one and start the pipeline.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {batches.map((batch) => (
            <BatchCard key={batch.batchId} batch={batch} onSelect={() => onSelect(batch.batchId)} />
          ))}
        </div>
      )}
    </section>
  );
}
