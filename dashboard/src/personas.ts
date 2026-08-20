import type { AgentKey } from "./types";

/**
 * Cosmetic dashboard persona roster (CLAUDE.md "Explicit scope (v1)":
 * presentation only — never the source of a displayed number; every
 * number on the dashboard still comes from Ledger's real run data).
 *
 * `agent` is the real module name from CLAUDE.md's Agents section and
 * doubles as the slug used for the portrait file and the disclosure
 * manifest in /dashboard/public/agents/. `accent` is a purely cosmetic
 * UI color, not data.
 *
 * `portrait` is a path relative to the public dir (no leading slash) —
 * resolve it with assetUrl() from ./lib/format before use, since the app
 * is deployed under GitHub Pages' /Machine/ base path.
 */
export interface AgentPersona {
  agent: AgentKey;
  personaName: string;
  tagline: string;
  subtitle: string;
  portrait: string;
  accent: string;
}

export const AGENT_PERSONAS: AgentPersona[] = [
  {
    agent: "opportunityScanner",
    personaName: "VANTAGE",
    tagline: "Surveys the whole shelf before choosing where to stand.",
    subtitle: "Opportunity Scanner · weekly category selection",
    portrait: "agents/opportunityScanner.png",
    accent: "#f97316",
  },
  {
    agent: "scout",
    personaName: "ATLAS",
    tagline: "Maps the niche before anyone else finds it.",
    subtitle: "Scout · niche research & theme selection",
    portrait: "agents/scout.png",
    accent: "#38bdf8",
  },
  {
    agent: "loom",
    personaName: "MUSE",
    tagline: "Turns one idea into thirty prompts.",
    subtitle: "Loom · image-prompt generation",
    portrait: "agents/loom.png",
    accent: "#a78bfa",
  },
  {
    agent: "etch",
    personaName: "GLYPH",
    tagline: "Draws every page, no placeholders.",
    subtitle: "Etch · interior image generation",
    portrait: "agents/etch.png",
    accent: "#2dd4bf",
  },
  {
    agent: "writer",
    personaName: "QUILL",
    tagline: "Writes the whole book when there's no picture to draw.",
    subtitle: "Writer · full manuscript generation",
    portrait: "agents/writer.png",
    accent: "#e879f9",
  },
  {
    agent: "bindery",
    personaName: "FOLIO",
    tagline: "Binds the pages into something sellable.",
    subtitle: "Bindery · interior PDF assembly",
    portrait: "agents/bindery.png",
    accent: "#fbbf24",
  },
  {
    agent: "crier",
    personaName: "HERALD",
    tagline: "Writes the words that get it found.",
    subtitle: "Crier · KDP listing copy",
    portrait: "agents/crier.png",
    accent: "#fb7185",
  },
  {
    agent: "ledger",
    personaName: "TALLY",
    tagline: "Never repeats a number it can't prove.",
    subtitle: "Ledger · run & batch status",
    portrait: "agents/ledger.png",
    accent: "#34d399",
  },
  {
    agent: "sentinel",
    personaName: "SENTINEL",
    tagline: "Watches the machine watch itself.",
    subtitle: "Sentinel · CI/ops monitoring & fix PRs",
    portrait: "agents/sentinel.png",
    accent: "#f87171",
  },
  {
    agent: "analyst",
    personaName: "COMPASS",
    tagline: "Reports what actually sold — nothing else.",
    subtitle: "Analyst · sales & royalty analytics",
    portrait: "agents/analyst.png",
    accent: "#818cf8",
  },
];

export const PERSONA_BY_AGENT: Record<AgentKey, AgentPersona> = Object.fromEntries(
  AGENT_PERSONAS.map((p) => [p.agent, p])
) as Record<AgentKey, AgentPersona>;
