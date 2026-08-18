/**
 * Cosmetic dashboard persona roster (CLAUDE.md "Explicit scope (v1)":
 * presentation only — never the source of a displayed number; every
 * number on the dashboard still comes from Ledger's real run data).
 *
 * `agent` is the real module name from CLAUDE.md's Agents section and
 * doubles as the slug used for the portrait file and the disclosure
 * manifest in /dashboard/public/agents/.
 */
export interface AgentPersona {
  agent: string;
  personaName: string;
  tagline: string;
  subtitle: string;
  portrait: string;
}

export const AGENT_PERSONAS: AgentPersona[] = [
  {
    agent: "scout",
    personaName: "ATLAS",
    tagline: "Maps the niche before anyone else finds it.",
    subtitle: "Scout · niche research & theme selection",
    portrait: "/agents/scout.png",
  },
  {
    agent: "loom",
    personaName: "MUSE",
    tagline: "Turns one idea into thirty prompts.",
    subtitle: "Loom · image-prompt generation",
    portrait: "/agents/loom.png",
  },
  {
    agent: "etch",
    personaName: "GLYPH",
    tagline: "Draws every page, no placeholders.",
    subtitle: "Etch · interior image generation",
    portrait: "/agents/etch.png",
  },
  {
    agent: "bindery",
    personaName: "FOLIO",
    tagline: "Binds the pages into something sellable.",
    subtitle: "Bindery · interior PDF assembly",
    portrait: "/agents/bindery.png",
  },
  {
    agent: "crier",
    personaName: "HERALD",
    tagline: "Writes the words that get it found.",
    subtitle: "Crier · KDP listing copy",
    portrait: "/agents/crier.png",
  },
  {
    agent: "ledger",
    personaName: "TALLY",
    tagline: "Never repeats a number it can't prove.",
    subtitle: "Ledger · run & batch status",
    portrait: "/agents/ledger.png",
  },
  {
    agent: "sentinel",
    personaName: "SENTINEL",
    tagline: "Watches the machine watch itself.",
    subtitle: "Sentinel · CI/ops monitoring & fix PRs",
    portrait: "/agents/sentinel.png",
  },
  {
    agent: "analyst",
    personaName: "COMPASS",
    tagline: "Reports what actually sold — nothing else.",
    subtitle: "Analyst · sales & royalty analytics",
    portrait: "/agents/analyst.png",
  },
];
