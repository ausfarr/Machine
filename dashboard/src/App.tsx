import { useEffect, useState } from "react";
import type { AgentKey, LedgerStatusFile } from "./types";
import { Header } from "./components/Header";
import { AgentRoster } from "./components/AgentRoster";
import { CentralVisualization } from "./components/CentralVisualization";
import { ActivityFeed } from "./components/ActivityFeed";
import { BatchList } from "./components/BatchList";
import { AgentDetailPanel } from "./components/AgentDetailPanel";

export default function App() {
  const [status, setStatus] = useState<LedgerStatusFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentKey | null>(null);

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
      <div className="mx-auto max-w-6xl">
        {error && (
          <div className="mb-6 rounded-lg border border-red-900 bg-red-950 p-4 text-sm text-red-200">
            Couldn't load status.json ({error}). Run <code className="font-mono">npm run ledger</code> from the
            repo root to generate it.
          </div>
        )}

        {!status && !error && <p className="text-sm text-slate-400">Loading pipeline status&hellip;</p>}

        {status && (
          <div className="space-y-10">
            <Header status={status} />

            {status.summary.invalidBatchCount > 0 && (
              <div className="rounded-lg border border-amber-900 bg-amber-950 p-4 text-sm text-amber-200">
                <p className="font-semibold">{status.summary.invalidBatchCount} batch folder(s) need attention:</p>
                <ul className="mt-2 list-inside list-disc space-y-1">
                  {status.invalidBatches.map((b) => (
                    <li key={b.batchId}>
                      <span className="font-mono">{b.batchId}</span>: {b.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <CentralVisualization agents={status.agents} />

            <AgentRoster agents={status.agents} onSelect={setSelectedAgent} />

            <div className="grid gap-6 lg:grid-cols-2">
              <ActivityFeed events={status.activity} />
              <BatchList batches={status.batches} />
            </div>
          </div>
        )}

        {status &&
          selectedAgent &&
          (() => {
            const activity = status.agents.find((a) => a.agent === selectedAgent);
            if (!activity) return null;
            return (
              <AgentDetailPanel
                agent={selectedAgent}
                activity={activity}
                status={status}
                onClose={() => setSelectedAgent(null)}
              />
            );
          })()}
      </div>
    </div>
  );
}
