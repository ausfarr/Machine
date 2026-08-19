import type { AgentRunStatus } from "../types";

const STATUS_COPY: Record<AgentRunStatus, string> = {
  active: "ACTIVE",
  idle: "IDLE",
  not_yet_run: "NOT YET RUN",
};

const STATUS_CLASSES: Record<AgentRunStatus, string> = {
  active: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  idle: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  not_yet_run: "border-slate-600/60 bg-slate-800/60 text-slate-500",
};

const DOT_CLASSES: Record<AgentRunStatus, string> = {
  active: "bg-emerald-400 shadow-[0_0_6px_2px_rgba(52,211,153,0.7)]",
  idle: "bg-amber-400",
  not_yet_run: "bg-slate-600",
};

export function StatusPill({ status }: { status: AgentRunStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-wide ${STATUS_CLASSES[status]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT_CLASSES[status]}`} aria-hidden="true" />
      {STATUS_COPY[status]}
    </span>
  );
}
