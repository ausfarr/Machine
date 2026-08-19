import type { AgentActivity, AgentKey } from "../types";
import { AGENT_PERSONAS } from "../personas";
import { AgentCard } from "./AgentCard";

export function AgentRoster({
  agents,
  onSelect,
}: {
  agents: AgentActivity[];
  onSelect: (agent: AgentKey) => void;
}) {
  const byAgent = new Map(agents.map((a) => [a.agent, a]));

  return (
    <section>
      <h2 className="text-[11px] font-semibold tracking-[0.2em] text-slate-500">AGENT ROSTER</h2>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {AGENT_PERSONAS.map((persona) => {
          const activity = byAgent.get(persona.agent);
          if (!activity) return null;
          return (
            <AgentCard key={persona.agent} persona={persona} activity={activity} onSelect={() => onSelect(persona.agent)} />
          );
        })}
      </div>
    </section>
  );
}
