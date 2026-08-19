import { useEffect, useState, type FormEvent } from "react";
import { BATCH_STAGES, type BatchStatus } from "../types";
import { formatDate, formatRelative } from "../lib/format";
import { STAGE_BADGE_CLASSES, STAGE_LABELS } from "./BatchList";
import { REQUIRED_DPI, TRIM_SIZE_LABEL, gutterMarginIn } from "../../../agents/bindery/kdpSpecs";
import { getToken, onTokenChange } from "../lib/githubToken";
import { commitFile, getFile } from "../lib/githubWrite";

const RAW_BASE = "https://raw.githubusercontent.com/ausfarr/Machine/main/batches";

/** Subset of manifest.json this drawer needs (bindery.trimSize isn't inlined into status.json). */
interface RawManifestSubset {
  bindery?: { trimSize?: string };
}

/** Mirrors agents/crier/index.ts's ListingFile — Ledger doesn't inline this into status.json, so it's fetched separately. */
interface ListingFile {
  title: string;
  subtitle: string;
  keywords: string[];
  categories: string[];
  description: string;
}

async function fetchRawJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Fetches this batch's real listing.json / manifest.json from GitHub when the drawer needs fields Ledger doesn't inline into status.json. */
function useBatchRawData(batchId: string, needsListing: boolean, needsTrimSize: boolean) {
  const [listing, setListing] = useState<ListingFile | null>(null);
  const [trimSize, setTrimSize] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setListing(null);
    setTrimSize(null);
    if (!needsListing && !needsTrimSize) return;
    setLoading(true);
    (async () => {
      const [listingData, manifestData] = await Promise.all([
        needsListing ? fetchRawJson<ListingFile>(`${RAW_BASE}/${batchId}/listing.json`) : Promise.resolve(null),
        needsTrimSize ? fetchRawJson<RawManifestSubset>(`${RAW_BASE}/${batchId}/manifest.json`) : Promise.resolve(null),
      ]);
      if (cancelled) return;
      setListing(listingData);
      setTrimSize(manifestData?.bindery?.trimSize ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [batchId, needsListing, needsTrimSize]);

  return { listing, trimSize, loading };
}

type StepKey = "scout" | "loom" | "images" | "coverArt" | "bindery" | "crier" | "published";

const STEPS: { key: StepKey; label: string }[] = [
  { key: "scout", label: "Scout" },
  { key: "loom", label: "Loom" },
  { key: "images", label: "Etch (images)" },
  { key: "coverArt", label: "Cover" },
  { key: "bindery", label: "Bindery" },
  { key: "crier", label: "Crier" },
  { key: "published", label: "Published" },
];

function stepDetail(batch: BatchStatus, key: StepKey): { timestamp: string; text: string } | null {
  switch (key) {
    case "scout":
      return batch.scout.done && batch.scout.detail
        ? { timestamp: batch.scout.detail.completedAt, text: `Competition: ${batch.scout.detail.competitionLevel}` }
        : null;
    case "loom":
      return batch.loom.done && batch.loom.detail
        ? { timestamp: batch.loom.detail.completedAt, text: `${batch.loom.detail.promptCount} prompts` }
        : null;
    case "images":
      return batch.images.done && batch.images.detail
        ? { timestamp: batch.images.detail.addedAt, text: `${batch.images.detail.count} image(s) via ${batch.images.detail.source}` }
        : null;
    case "coverArt":
      return batch.coverArt.done && batch.coverArt.detail
        ? { timestamp: batch.coverArt.detail.addedAt, text: `via ${batch.coverArt.detail.source}` }
        : null;
    case "bindery":
      return batch.bindery.done && batch.bindery.detail
        ? { timestamp: batch.bindery.detail.completedAt, text: `${batch.bindery.detail.pageCount}-page interior` }
        : null;
    case "crier":
      return batch.crier.done && batch.crier.detail
        ? { timestamp: batch.crier.detail.completedAt, text: "Listing copy written (AI-generated, disclosed)" }
        : null;
    case "published":
      return batch.published.done && batch.published.detail
        ? { timestamp: batch.published.detail.publishedAt, text: "Published" }
        : null;
  }
}

function StageStepper({ batch }: { batch: BatchStatus }) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {STEPS.map(({ key, label }) => {
        const detail = stepDetail(batch, key);
        const done = batch[key].done;
        return (
          <div
            key={key}
            className={`min-w-[9rem] flex-1 rounded-lg border p-3 ${
              done ? "border-emerald-500/30 bg-emerald-500/5" : "border-slate-800 bg-slate-900/40"
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${done ? "bg-emerald-400" : "bg-slate-700"}`} aria-hidden="true" />
              <span className={`text-xs font-semibold ${done ? "text-slate-200" : "text-slate-600"}`}>{label}</span>
            </div>
            {detail ? (
              <>
                <p className="mt-1.5 text-[11px] text-slate-400">{detail.text}</p>
                <p className="mt-0.5 text-[10px] text-slate-600">{formatRelative(detail.timestamp)}</p>
              </>
            ) : (
              <p className="mt-1.5 text-[11px] text-slate-600">Pending</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ThumbnailGrid({ batch }: { batch: BatchStatus }) {
  const [broken, setBroken] = useState<Set<string>>(new Set());

  if (!batch.images.done || !batch.images.detail) {
    return <p className="mt-3 text-sm text-slate-500">No images yet.</p>;
  }

  const count = batch.images.detail.count;
  // Matches agents/etch/index.ts's `${String(index).padStart(2, "0")}.png` page naming.
  const tiles = [
    ...(batch.coverArt.done ? [{ key: "cover-art.png", label: "Cover", src: `${RAW_BASE}/${batch.batchId}/cover-art.png` }] : []),
    ...Array.from({ length: count }, (_, i) => {
      const fileName = `${String(i + 1).padStart(2, "0")}.png`;
      return { key: fileName, label: `Page ${i + 1}`, src: `${RAW_BASE}/${batch.batchId}/images/${fileName}` };
    }),
  ];

  return (
    <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
      {tiles
        .filter((t) => !broken.has(t.key))
        .map((t) => (
          <div key={t.key} className="overflow-hidden rounded border border-slate-800 bg-slate-900">
            <img
              src={t.src}
              alt={t.label}
              loading="lazy"
              className="aspect-square w-full object-cover"
              onError={() => setBroken((prev) => new Set(prev).add(t.key))}
            />
          </div>
        ))}
    </div>
  );
}

function ListingPreview({
  listing,
  loading,
  crierDone,
}: {
  listing: ListingFile | null;
  loading: boolean;
  crierDone: boolean;
}) {
  if (!crierDone) {
    return <p className="mt-3 text-sm text-slate-500">Not listed yet — Crier hasn't run on this batch.</p>;
  }
  if (loading && !listing) {
    return <p className="mt-3 text-sm text-slate-500">Loading listing&hellip;</p>;
  }
  if (!listing) {
    return <p className="mt-3 text-sm text-slate-500">Couldn't load listing.json from GitHub.</p>;
  }

  return (
    <div className="mt-3 space-y-2.5 text-sm">
      <p className="font-semibold text-slate-100">{listing.title}</p>
      <p className="text-slate-400">{listing.subtitle}</p>
      <div className="flex flex-wrap gap-1.5">
        {listing.keywords.map((k) => (
          <span key={k} className="rounded-full border border-slate-700 bg-slate-800/60 px-2 py-0.5 text-[10px] text-slate-300">
            {k}
          </span>
        ))}
      </div>
      <ul className="list-inside list-disc space-y-0.5 text-[11px] text-slate-500">
        {listing.categories.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <p className="whitespace-pre-line text-slate-400">{listing.description}</p>
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-800 bg-slate-900/40 p-2">
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className="mt-0.5 font-mono text-slate-200">{value}</p>
    </div>
  );
}

function PrintSpecPanel({ batch, trimSize, loading }: { batch: BatchStatus; trimSize: string | null; loading: boolean }) {
  if (!batch.bindery.done || !batch.bindery.detail) {
    return <p className="mt-3 text-sm text-slate-500">Not assembled yet — Bindery hasn't run on this batch.</p>;
  }

  const pageCount = batch.bindery.detail.pageCount;
  const gutter = gutterMarginIn(pageCount);
  const trimSizeValue = loading ? "Loading…" : (trimSize ?? TRIM_SIZE_LABEL);

  return (
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
      <Spec label="Trim size" value={trimSizeValue} />
      <Spec label="Required DPI" value={`${REQUIRED_DPI}`} />
      <Spec label="Page count" value={`${pageCount}`} />
      <Spec label="Gutter margin" value={`${gutter.toFixed(3)}in`} />
    </div>
  );
}

function SalesPanel({ batch }: { batch: BatchStatus }) {
  if (!batch.published.done) {
    return <p className="mt-3 text-sm text-slate-500">Not published yet.</p>;
  }
  const sales = batch.published.detail?.sales;
  if (!sales) {
    return <p className="mt-3 text-sm text-slate-500">Published, but no KDP sales report has been matched yet.</p>;
  }
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
      <Spec label="Units sold" value={`${sales.unitsSold}`} />
      <Spec label="Royalty total" value={`${sales.royaltyTotal.toFixed(2)} ${sales.currency}`} />
      <Spec label="As of" value={formatDate(sales.reportPeriodEnd)} />
    </div>
  );
}

type FormFieldState = { asin: string; priceUsd: string; marketplaceUrl: string; publishedAt: string };

type PublishSubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string };

/** Minimal shape this form needs to read/merge from the batch's raw manifest.json — the rest of the file is passed through untouched. */
interface RawManifestForPublish {
  published?: {
    publishedAt?: string;
    asin?: string;
    priceUsd?: number;
    marketplaceUrl?: string;
    sales?: unknown;
  };
  [key: string]: unknown;
}

function PublishStatusForm({ batch }: { batch: BatchStatus }) {
  const existing = batch.published.detail;
  const [fields, setFields] = useState<FormFieldState>({
    asin: existing?.asin ?? "",
    priceUsd: existing?.priceUsd !== undefined ? String(existing.priceUsd) : "",
    marketplaceUrl: existing?.marketplaceUrl ?? "",
    publishedAt: existing?.publishedAt ?? new Date().toISOString(),
  });
  const [hasToken, setHasToken] = useState(() => getToken() !== null);
  const [state, setState] = useState<PublishSubmitState>({ kind: "idle" });

  useEffect(() => onTokenChange(() => setHasToken(getToken() !== null)), []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) {
      setState({ kind: "error", message: "Save a GitHub token first (gear icon above)." });
      return;
    }

    setState({ kind: "submitting" });
    const path = `batches/${batch.batchId}/manifest.json`;
    try {
      const file = await getFile(path, token);
      if (!file) {
        setState({ kind: "error", message: `Couldn't find ${path} on GitHub.` });
        return;
      }
      const raw = JSON.parse(file.content) as RawManifestForPublish;
      const publishedAtIso = new Date(fields.publishedAt).toISOString();

      const updated = {
        ...raw,
        stage: "published",
        updatedAt: new Date().toISOString(),
        published: {
          ...raw.published,
          publishedAt: publishedAtIso,
          asin: fields.asin.trim() || undefined,
          priceUsd: fields.priceUsd.trim() ? Number(fields.priceUsd) : undefined,
          marketplaceUrl: fields.marketplaceUrl.trim() || undefined,
        },
      };

      const outcome = await commitFile(
        path,
        `${JSON.stringify(updated, null, 2)}\n`,
        `Mark ${batch.batchId} as published`
      );

      if (outcome.kind === "success") {
        setState({ kind: "success" });
      } else if (outcome.kind === "no-token") {
        setState({ kind: "error", message: "Save a GitHub token first (gear icon above)." });
      } else {
        setState({ kind: "error", message: outcome.message });
      }
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  const disabledReason = !hasToken ? "Save a GitHub token first (gear icon above) to record publish status." : null;

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-2.5 text-sm">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <label className="block">
          <span className="text-[10px] text-slate-500">ASIN</span>
          <input
            type="text"
            value={fields.asin}
            onChange={(e) => setFields((f) => ({ ...f, asin: e.target.value }))}
            placeholder="B0..."
            className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:border-slate-500 focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="text-[10px] text-slate-500">Price (USD)</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={fields.priceUsd}
            onChange={(e) => setFields((f) => ({ ...f, priceUsd: e.target.value }))}
            placeholder="9.99"
            className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:border-slate-500 focus:outline-none"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-[10px] text-slate-500">Marketplace URL</span>
          <input
            type="text"
            value={fields.marketplaceUrl}
            onChange={(e) => setFields((f) => ({ ...f, marketplaceUrl: e.target.value }))}
            placeholder="https://www.amazon.com/dp/..."
            className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:border-slate-500 focus:outline-none"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-[10px] text-slate-500">Published at</span>
          <input
            type="datetime-local"
            value={fields.publishedAt.slice(0, 16)}
            onChange={(e) => setFields((f) => ({ ...f, publishedAt: e.target.value }))}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 focus:border-slate-500 focus:outline-none"
          />
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={Boolean(disabledReason) || state.kind === "submitting"}
          title={disabledReason ?? undefined}
          className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {state.kind === "submitting" ? "Saving…" : "Save publish status"}
        </button>
        {state.kind === "success" && <p className="text-[11px] text-emerald-300">Saved — dashboard will update shortly.</p>}
        {state.kind === "error" && <p className="text-[11px] text-red-300">{state.message}</p>}
      </div>
    </form>
  );
}

export function BatchDetailDrawer({ batch, onClose }: { batch: BatchStatus; onClose: () => void }) {
  const { listing, trimSize, loading } = useBatchRawData(batch.batchId, batch.crier.done, batch.bindery.done);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70" onClick={onClose}>
      <div
        className="animate-drawer-slide-in h-full w-full max-w-xl overflow-y-auto border-l border-slate-800 bg-slate-950 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-100">{batch.theme}</h2>
            <p className="mt-0.5 font-mono text-[11px] text-slate-600">{batch.batchId}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full border border-slate-700 px-2.5 py-1 text-xs text-slate-400 hover:bg-slate-800"
          >
            Close
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-wide ${STAGE_BADGE_CLASSES[batch.stage]}`}>
            {STAGE_LABELS[batch.stage]}
          </span>
          <p className="text-xs text-slate-500">
            Created {formatDate(batch.createdAt)} &middot; Updated {formatDate(batch.updatedAt)}
          </p>
        </div>

        <div className="mt-6">
          <h3 className="text-[11px] font-semibold tracking-[0.2em] text-slate-500">PIPELINE STAGES</h3>
          <div className="mt-3">
            <StageStepper batch={batch} />
          </div>
        </div>

        <div className="mt-6">
          <h3 className="text-[11px] font-semibold tracking-[0.2em] text-slate-500">IMAGES</h3>
          <ThumbnailGrid batch={batch} />
        </div>

        <div className="mt-6">
          <h3 className="text-[11px] font-semibold tracking-[0.2em] text-slate-500">LISTING PREVIEW</h3>
          <ListingPreview listing={listing} loading={loading} crierDone={batch.crier.done} />
        </div>

        <div className="mt-6">
          <h3 className="text-[11px] font-semibold tracking-[0.2em] text-slate-500">PRINT SPEC</h3>
          <PrintSpecPanel batch={batch} trimSize={trimSize} loading={loading} />
        </div>

        {BATCH_STAGES.indexOf(batch.stage) >= BATCH_STAGES.indexOf("listed") && (
          <div className="mt-6">
            <h3 className="text-[11px] font-semibold tracking-[0.2em] text-slate-500">PUBLISH STATUS</h3>
            <PublishStatusForm batch={batch} />
          </div>
        )}

        <div className="mt-6">
          <h3 className="text-[11px] font-semibold tracking-[0.2em] text-slate-500">REVENUE</h3>
          <SalesPanel batch={batch} />
        </div>
      </div>
    </div>
  );
}
