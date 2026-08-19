import type { BatchStage, BatchStatus } from "../types";
import { formatDate } from "../lib/format";

const STAGE_LABELS: Record<BatchStage, string> = {
  researched: "Researched",
  prompted: "Prompted",
  imaged: "Imaged",
  assembled: "Assembled",
  listed: "Listed",
  published: "Published",
};

const STAGE_BADGE_CLASSES: Record<BatchStage, string> = {
  researched: "border-slate-600/50 bg-slate-700/40 text-slate-200",
  prompted: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  imaged: "border-indigo-500/40 bg-indigo-500/10 text-indigo-300",
  assembled: "border-violet-500/40 bg-violet-500/10 text-violet-300",
  listed: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  published: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
};

const PIPELINE_STEPS: {
  key: keyof Pick<BatchStatus, "scout" | "loom" | "images" | "coverArt" | "bindery" | "crier" | "published">;
  label: string;
}[] = [
  { key: "scout", label: "Scout" },
  { key: "loom", label: "Loom" },
  { key: "images", label: "Images" },
  { key: "coverArt", label: "Cover" },
  { key: "bindery", label: "Bindery" },
  { key: "crier", label: "Crier" },
  { key: "published", label: "Published" },
];

function BatchCard({ batch }: { batch: BatchStatus }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
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
        {PIPELINE_STEPS.map(({ key, label }) => (
          <div key={key} className="flex items-center gap-1.5 text-xs">
            <span className={`h-1.5 w-1.5 rounded-full ${batch[key].done ? "bg-emerald-400" : "bg-slate-700"}`} aria-hidden="true" />
            <span className={batch[key].done ? "text-slate-300" : "text-slate-600"}>{label}</span>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[11px] text-slate-600">
        Created {formatDate(batch.createdAt)} &middot; Updated {formatDate(batch.updatedAt)}
      </p>
    </div>
  );
}

export function BatchList({ batches }: { batches: BatchStatus[] }) {
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
            <BatchCard key={batch.batchId} batch={batch} />
          ))}
        </div>
      )}
    </section>
  );
}
