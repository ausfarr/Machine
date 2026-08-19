import { useEffect, useState } from "react";
import type { BatchStatus } from "../types";
import { formatDate, formatRelative } from "../lib/format";
import { STAGE_BADGE_CLASSES, STAGE_LABELS } from "./BatchList";
import {
  COVER_BLEED_IN,
  MIN_PAGES_FOR_SPINE_TEXT,
  REQUIRED_DPI,
  TRIM_SIZE_LABEL,
  gutterMarginIn,
  spineWidthIn,
} from "../../../agents/bindery/kdpSpecs";

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
  const spine = spineWidthIn(pageCount);
  const clearsSpineText = pageCount >= MIN_PAGES_FOR_SPINE_TEXT;
  const trimSizeValue = loading ? "Loading…" : (trimSize ?? TRIM_SIZE_LABEL);

  return (
    <div className="mt-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Spec label="Trim size" value={trimSizeValue} />
        <Spec label="Required DPI" value={`${REQUIRED_DPI}`} />
        <Spec label="Page count" value={`${pageCount}`} />
        <Spec label="Gutter margin" value={`${gutter.toFixed(3)}in`} />
        <Spec label="Cover bleed" value={`${COVER_BLEED_IN}in`} />
        <Spec label="Spine width" value={`${spine.toFixed(4)}in`} />
      </div>
      {!clearsSpineText && (
        <p className="mt-2 text-[11px] text-slate-500">
          Spine left blank &mdash; under {MIN_PAGES_FOR_SPINE_TEXT}pg.
        </p>
      )}
    </div>
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
      </div>
    </div>
  );
}
