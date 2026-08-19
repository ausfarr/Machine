import type { AgentActivity } from "../types";
import { AGENT_PERSONAS } from "../personas";

/**
 * Decorative activity map tying the roster together. Purely aesthetic —
 * it displays no numbers — but node brightness does reflect each agent's
 * real status (active/idle/not_yet_run) rather than being arbitrary.
 */
export function CentralVisualization({ agents }: { agents: AgentActivity[] }) {
  const byAgent = new Map(agents.map((a) => [a.agent, a]));
  const size = 420;
  const center = size / 2;
  const radius = 150;

  const nodes = AGENT_PERSONAS.map((persona, i) => {
    const angle = (i / AGENT_PERSONAS.length) * Math.PI * 2 - Math.PI / 2;
    const x = center + radius * Math.cos(angle);
    const y = center + radius * Math.sin(angle);
    const status = byAgent.get(persona.agent)?.status ?? "not_yet_run";
    return { persona, x, y, status };
  });

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
      <h2 className="text-[11px] font-semibold tracking-[0.2em] text-slate-500">FLEET ACTIVITY MAP</h2>
      <div className="mt-2 flex justify-center">
        <svg viewBox={`0 0 ${size} ${size}`} className="h-auto w-full max-w-md" role="img" aria-label="Agent fleet activity map">
          <defs>
            <radialGradient id="core-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
            </radialGradient>
          </defs>

          <circle cx={center} cy={center} r={90} fill="url(#core-glow)" />

          {nodes.map(({ persona, x, y, status }) => (
            <line
              key={`line-${persona.agent}`}
              x1={center}
              y1={center}
              x2={x}
              y2={y}
              stroke={persona.accent}
              strokeOpacity={status === "not_yet_run" ? 0.12 : status === "active" ? 0.55 : 0.28}
              strokeWidth={status === "active" ? 1.5 : 1}
            />
          ))}

          <circle cx={center} cy={center} r={10} fill="#e2e8f0" opacity={0.9} />

          {nodes.map(({ persona, x, y, status }) => (
            <g key={persona.agent} className={status === "active" ? "animate-pulse-node" : undefined}>
              <circle
                cx={x}
                cy={y}
                r={status === "not_yet_run" ? 4 : 7}
                fill={persona.accent}
                opacity={status === "not_yet_run" ? 0.35 : 1}
              />
              {status !== "not_yet_run" && <circle cx={x} cy={y} r={13} fill={persona.accent} opacity={0.18} />}
            </g>
          ))}
        </svg>
      </div>
    </section>
  );
}
