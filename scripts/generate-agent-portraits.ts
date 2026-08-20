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
  "A moody, cinematic portrait blending photographic human realism with a " +
  "glowing monochrome-blue hologram/wireframe treatment: real, detailed, " +
  "individual facial features and a distinct personality/expression — not " +
  "an abstract or generic mesh face. Softly lit by a cool blue glow, set " +
  "against a near-black navy background with subtle atmospheric haze. " +
  "Shoulders-up framing, centered, mission-control HUD aesthetic, no text, " +
  "no logos, no watermark, square aspect ratio, high detail digital art.";

const VISUAL_MOTIFS: Record<string, string> = {
  opportunityScanner:
    "A perceptive figure with a wide, panoramic gaze fixed on the far distance, calm and appraising, head tilted slightly as if weighing many possibilities at once. A faint glowing radar-sweep / horizon-line arcs across their brow, one point along it lit brighter than the rest.",
  scout:
    "A young man with short dark hair and a focused, scanning gaze, chin " +
    "slightly lifted as if reading a distant horizon. A faint glowing " +
    "star-map / compass grid traces across his forehead and cheek.",
  loom:
    "A woman with long flowing hair and an inspired, dreamy expression, " +
    "glancing slightly upward. Faint threads of glowing blue light weave " +
    "through her hair and around her shoulders, as if spinning an idea " +
    "into form.",
  etch:
    "A man with sharp features, short hair, and an intent, focused " +
    "expression, leaning slightly forward as if mid-work. A single glowing " +
    "line traces fine linework across his cheek and jaw, like a stylus " +
    "etching itself into being.",
  writer:
    "A contemplative woman with a distant, inward gaze, mid-thought, as " +
    "if listening for the next sentence. Faint glowing lines of handwritten " +
    "script trail from her temple like unspooling thread, gathering into " +
    "words at her collar.",
  bindery:
    "A composed woman with her hair pulled back and a calm, orderly " +
    "expression. Faint glowing lines like stacked bound pages trace across " +
    "her collar and shoulder, spine-lit.",
  crier:
    "A confident man with an animated, mid-speech expression and a slight " +
    "smile. A glowing waveform / broadcast signal radiates faintly from " +
    "his collar and jaw, like a herald's call.",
  ledger:
    "A sharp-eyed woman with neatly styled hair and a precise, attentive " +
    "expression. A faint glowing ledger-grid and tally-mark pattern " +
    "overlays her cheek and collar, orderly and exact.",
  sentinel:
    "A vigilant man with a strong jaw and a stern, watchful expression. A " +
    "faint glowing shield-shaped emblem rests at his collar, with a single " +
    "point of light reflected in his eyes.",
  analyst:
    "A thoughtful woman with an analytical, calm expression, gazing " +
    "slightly off-frame. A faint glowing compass rose and upward " +
    "trend-line overlay her shoulder and collar, precise and analytical.",
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
