import { useEffect, useState } from "react";
import type { BatchStage, BatchStatus, LedgerStatusFile } from "./types";
import { BATCH_STAGES } from "./types";

const STAGE_LABELS: Record<BatchStage, string> = {
  researched: "Researched",
  prompted: "Prompted",
  imaged: "Imaged",
  assembled: "Assembled",
  listed: "Listed",
  published: "Published",
};

const STAGE_BADGE_CLASSES: Record<BatchStage, string> = {
  researched: "bg-slate-700 text-slate-100",
  prompted: "bg-sky-700 text-sky-50",
  imaged: "bg-indigo-700 text-indigo-50",
  assembled: "bg-violet-700 text-violet-50",
  listed: "bg-amber-700 text-amber-50",
  published: "bg-emerald-700 text-emerald-50",
};

const PIPELINE_STEPS: { key: keyof Pick<BatchStatus, "scout" | "loom" | "images" | "bindery" | "crier" | "published">; label: string }[] = [
  { key: "scout", label: "Scout" },
  { key: "loom", label: "Loom" },
  { key: "images", label: "Images" },
  { key: "bindery", label: "Bindery" },
  { key: "crier", label: "Crier" },
  { key: "published", label: "Published" },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function StageBadge({ stage }: { stage: BatchStage }) {
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STAGE_BADGE_CLASSES[stage]}`}>
      {STAGE_LABELS[stage]}
    </span>
  );
}

function ChecklistDot({ done }: { done: boolean }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${done ? "bg-emerald-400" : "bg-slate-600"}`}
      aria-hidden="true"
    />
  );
}

function BatchCard({ batch }: { batch: BatchStatus }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-100">{batch.theme}</h3>
          <p className="mt-0.5 font-mono text-xs text-slate-500">{batch.batchId}</p>
        </div>
        <StageBadge stage={batch.stage} />
      </div>

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
        {PIPELINE_STEPS.map(({ key, label }) => (
          <div key={key} className="flex items-center gap-2 text-sm">
            <ChecklistDot done={batch[key].done} />
            <span className={batch[key].done ? "text-slate-200" : "text-slate-500"}>{label}</span>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs text-slate-500">
        Created {formatDate(batch.createdAt)} &middot; Updated {formatDate(batch.updatedAt)}
      </p>
    </div>
  );
}

function SummaryBar({ status }: { status: LedgerStatusFile }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <p className="text-2xl font-bold text-slate-100">{status.summary.totalBatches}</p>
        <p className="text-xs text-slate-500">Total batches</p>
      </div>
      {BATCH_STAGES.map((stage) => (
        <div key={stage} className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <p className="text-2xl font-bold text-slate-100">{status.summary.byStage[stage]}</p>
          <p className="text-xs text-slate-500">{STAGE_LABELS[stage]}</p>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [status, setStatus] = useState<LedgerStatusFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}status.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`status.json responded ${res.status}`);
        return res.json();
      })
      .then((data: LedgerStatusFile) => setStatus(data))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-10 text-slate-200">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8">
          <h1 className="text-2xl font-bold text-slate-100">Coloring Book Pipeline</h1>
          <p className="mt-1 text-sm text-slate-400">
            Real pipeline status, read directly from each batch's manifest.json — nothing here is fabricated or
            placeholder data.
          </p>
        </header>

        {error && (
          <div className="mb-6 rounded-lg border border-red-900 bg-red-950 p-4 text-sm text-red-200">
            Couldn't load status.json ({error}). Run <code className="font-mono">npm run ledger</code> from the
            repo root to generate it.
          </div>
        )}

        {!status && !error && <p className="text-sm text-slate-400">Loading pipeline status&hellip;</p>}

        {status && (
          <div className="space-y-8">
            <SummaryBar status={status} />

            {status.invalidBatches.length > 0 && (
              <div className="rounded-lg border border-amber-900 bg-amber-950 p-4 text-sm text-amber-200">
                <p className="font-semibold">{status.invalidBatches.length} batch folder(s) need attention:</p>
                <ul className="mt-2 list-inside list-disc space-y-1">
                  {status.invalidBatches.map((b) => (
                    <li key={b.batchId}>
                      <span className="font-mono">{b.batchId}</span>: {b.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {status.batches.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-800 p-8 text-center">
                <p className="text-slate-300">No batches yet.</p>
                <p className="mt-1 text-sm text-slate-500">
                  Run <code className="font-mono">npm run scout -- "a theme"</code> to research one and start the
                  pipeline.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {status.batches.map((batch) => (
                  <BatchCard key={batch.batchId} batch={batch} />
                ))}
              </div>
            )}

            <p className="text-xs text-slate-600">Status generated {formatDate(status.generatedAt)}</p>
          </div>
        )}
      </div>
    </div>
  );
}
