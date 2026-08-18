/**
 * One-time static asset job: generates the 8 agent-persona portraits for
 * the dashboard via the Gemini API (Etch's already-authorized key — see
 * CLAUDE.md "Authorized external APIs"). Not a new runtime capability and
 * not part of the scheduled pipeline: run by hand, once, when the roster
 * or its visual direction changes. Output is disclosed as AI-generated in
 * dashboard/public/agents/manifest.json per the no-fabricated-data /
 * AI-disclosure guardrails.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { GeminiImageClient } from "../agents/etch/geminiClient.ts";
import { AGENT_PERSONAS } from "../dashboard/src/personas.ts";

const OUTPUT_DIR = join("dashboard", "public", "agents");
const PORTRAIT_SIZE = 768;

const SHARED_STYLE =
  "A cinematic dark mission-control character portrait: a humanoid figure " +
  "built from glowing monochrome-blue wireframe lines and faint circuit-like " +
  "glow, set against a near-black navy background with subtle depth fog. " +
  "Bust/shoulders framing, centered, symmetrical, high contrast, no text, " +
  "no logos, no watermark, square aspect ratio, digital concept art style.";

const VISUAL_MOTIFS: Record<string, string> = {
  scout:
    "The figure's head is overlaid with a faint glowing star-map / compass " +
    "grid, as if scanning the horizon for a location.",
  loom:
    "Threads of glowing blue light weave and cross around the figure's " +
    "hands and shoulders, as if spinning an idea into form.",
  etch:
    "A single glowing line traces and etches fine linework across the " +
    "figure's chest and face, like a stylus drawing itself into being.",
  bindery:
    "The figure's torso is formed of stacked, faintly glowing bound pages, " +
    "spine-lit, like an open book fused into armor.",
  crier:
    "A glowing waveform / broadcast signal radiates outward from the " +
    "figure's chest and shoulders, like a herald's call.",
  ledger:
    "The figure's chest is overlaid with a faint glowing ledger grid and " +
    "tally-mark lines, precise and orderly.",
  sentinel:
    "The figure stands watchful, with a glowing shield-like emblem on the " +
    "chest and a single watchful point of light at the head, faint " +
    "circuit-armor plating.",
  analyst:
    "A glowing compass rose and a faint upward trend-line overlay the " +
    "figure's chest, precise and analytical.",
};

function buildPrompt(agent: string): string {
  const motif = VISUAL_MOTIFS[agent];
  if (!motif) {
    throw new Error(`No visual motif defined for persona agent "${agent}".`);
  }
  return `${SHARED_STYLE} ${motif}`;
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const client = new GeminiImageClient();
  const generatedAt = new Date().toISOString();

  const manifestEntries: {
    agent: string;
    personaName: string;
    file: string;
    prompt: string;
  }[] = [];

  for (const persona of AGENT_PERSONAS) {
    const prompt = buildPrompt(persona.agent);
    console.log(`Generating portrait for ${persona.personaName} (${persona.agent})...`);

    const raw = await client.generateImage(prompt);
    const fileName = `${persona.agent}.png`;

    await sharp(raw).resize(PORTRAIT_SIZE, PORTRAIT_SIZE, { fit: "cover" }).png().toFile(join(OUTPUT_DIR, fileName));

    manifestEntries.push({
      agent: persona.agent,
      personaName: persona.personaName,
      file: fileName,
      prompt,
    });
  }

  const manifest = {
    generatedAt,
    source: "gemini",
    model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash-image",
    note: "AI-generated static portrait assets for cosmetic dashboard personas (CLAUDE.md 'Explicit scope (v1)'). Presentation only — never a source of dashboard numbers.",
    images: manifestEntries,
  };
  writeFileSync(join(OUTPUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));

  console.log(`Wrote ${manifestEntries.length} portraits + manifest.json to ${OUTPUT_DIR}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
