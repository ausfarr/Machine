import { useEffect, useRef, useState } from "react";
import { clearToken, getToken, maskToken, setToken } from "../lib/githubToken";

/** Small gear-icon affordance for storing the GitHub PAT that TriggerPipelineButton uses. Popover only — no dependency on other components. */
export function GithubTokenSettings() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [savedToken, setSavedToken] = useState<string | null>(() => getToken());
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  function handleSave() {
    if (!draft.trim()) return;
    setToken(draft.trim());
    setSavedToken(draft.trim());
    setDraft("");
  }

  function handleClear() {
    clearToken();
    setSavedToken(null);
    setDraft("");
  }

  return (
    <div className="relative" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="GitHub token settings"
        title="GitHub token settings"
        className="rounded-full border border-slate-700 p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065Z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 rounded-lg border border-slate-800 bg-slate-950 p-4 shadow-2xl">
          <p className="text-xs font-semibold tracking-wide text-slate-300">GITHUB TOKEN</p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
            Stored only in this browser. Needs a fine-grained PAT scoped to Actions: write on ausfarr/Machine only.
          </p>

          {savedToken ? (
            <p className="mt-3 text-xs text-emerald-300">Token saved (ends in {maskToken(savedToken)})</p>
          ) : (
            <p className="mt-3 text-xs text-slate-500">No token saved.</p>
          )}

          <input
            type="password"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="github_pat_..."
            autoComplete="off"
            className="mt-3 w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:border-slate-500 focus:outline-none"
          />

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={!draft.trim()}
              className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Save
            </button>
            {savedToken && (
              <button
                type="button"
                onClick={handleClear}
                className="rounded border border-slate-700 px-2.5 py-1.5 text-xs text-slate-400 hover:bg-slate-800"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
