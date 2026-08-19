import type { ActivityEvent } from "../types";
import { PERSONA_BY_AGENT } from "../personas";
import { formatRelative } from "../lib/format";

function ActorBadge({ actor }: { actor: ActivityEvent["actor"] }) {
  if (actor === "human") {
    return <span className="text-xs font-semibold tracking-wide text-slate-400">HUMAN</span>;
  }
  const persona = PERSONA_BY_AGENT[actor];
  return (
    <span className="text-xs font-semibold tracking-wide" style={{ color: persona.accent }}>
      {persona.personaName}
    </span>
  );
}

export function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
      <h2 className="text-[11px] font-semibold tracking-[0.2em] text-slate-500">ACTIVITY FEED</h2>

      {events.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No pipeline activity yet.</p>
      ) : (
        <ul className="mt-4 max-h-96 space-y-3 overflow-y-auto pr-1">
          {events.map((event, i) => (
            <li key={`${event.batchId}-${event.at}-${i}`} className="flex items-start justify-between gap-3 border-b border-slate-800/60 pb-3 last:border-0">
              <div>
                <div className="flex items-center gap-2">
                  <ActorBadge actor={event.actor} />
                  <span className="text-xs text-slate-600">{formatRelative(event.at)}</span>
                </div>
                <p className="mt-1 text-sm text-slate-300">{event.summary}</p>
              </div>
              <span className="shrink-0 font-mono text-[11px] text-slate-600">{event.batchId}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
