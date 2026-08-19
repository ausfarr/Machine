import type { AgentActivity } from "../types";
import type { AgentPersona } from "../personas";
import { StatusPill } from "./StatusPill";
import { assetUrl, formatRelative } from "../lib/format";

export function AgentCard({
  persona,
  activity,
  onSelect,
}: {
  persona: AgentPersona;
  activity: AgentActivity;
  onSelect: () => void;
}) {
  const dimmed = activity.status === "not_yet_run";

  return (
    <button
      type="button"
      onClick={onSelect}
      className="group flex flex-col items-center rounded-xl border border-slate-800 bg-slate-900/60 p-5 text-center transition hover:border-slate-600 hover:bg-slate-900"
    >
      <div
        className={`relative h-24 w-24 overflow-hidden rounded-full border-2 ${dimmed ? "grayscale" : ""}`}
        style={{
          borderColor: dimmed ? "rgb(51 65 85)" : persona.accent,
          boxShadow: dimmed ? "none" : `0 0 18px -2px ${persona.accent}66`,
        }}
      >
        <img src={assetUrl(persona.portrait)} alt={`${persona.personaName} portrait`} className="h-full w-full object-cover" />
      </div>

      <p className="mt-4 text-sm font-bold tracking-wide text-slate-100">{persona.personaName}</p>
      <p className="mt-1 text-xs text-slate-500">{persona.subtitle}</p>
      <p className="mt-2 text-xs italic text-slate-400">&ldquo;{persona.tagline}&rdquo;</p>

      <div className="mt-4">
        <StatusPill status={activity.status} />
      </div>

      <div className="mt-3 border-t border-slate-800 pt-3">
        <p className="text-xl font-bold text-slate-100">{activity.metric.value.toLocaleString()}</p>
        <p className="text-[11px] text-slate-500">{activity.metric.label}</p>
      </div>

      <p className="mt-2 text-[11px] text-slate-600">
        {activity.lastRanAt ? `Last ran ${formatRelative(activity.lastRanAt)}` : "Never run"}
      </p>
    </button>
  );
}
