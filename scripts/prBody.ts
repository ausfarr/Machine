import type { RunPipelineResult } from "./queue.ts";

/**
 * Builds the pipeline workflow's PR body — pulled out as a pure function
 * (rather than inline GitHub Actions expression conditionals in the YAML)
 * so the branching between an illustrated and a text-only (Writer-sourced)
 * batch is readable and unit-testable. See .github/workflows/pipeline.yml.
 */
export function buildPrBody(result: RunPipelineResult): string {
  const illustrated = result.contentType === "illustrated";
  const lines: string[] = [];

  lines.push(
    `Opportunity Scanner picked this week's KDP category — **${result.category}** — via the Anthropic API with the web_search tool, logging every candidate considered (including the ones passed over) in \`agents/opportunity-scanner/reports/\`. Scout then proposed and selected this theme itself within that category (blended with anything queued by hand in \`theme-queue.json\`) and researched it.`
  );
  lines.push("");

  if (illustrated) {
    lines.push(
      "Loom generated prompts (including a cover prompt with the title baked in), Etch generated the interior images and the front-cover art via the Gemini API, and Bindery + Crier assembled the interior PDF and listing copy — the whole pipeline ran unattended, per CLAUDE.md's Authorized external APIs section."
    );
  } else {
    lines.push(
      "Writer generated the full manuscript via the Anthropic API, and Bindery typeset it into a print-ready interior PDF — the whole pipeline ran unattended, per CLAUDE.md's Authorized external APIs section."
    );
  }

  if (!illustrated && result.writer) {
    lines.push("");
    lines.push(
      `> **This batch is text-only (Writer-sourced) — read it closely.** Writer generated the full ${result.writer.sectionCount}-section, ~${result.writer.wordCount}-word manuscript; there's no human-curated illustration step in between, so this warrants a closer read than an illustrated batch. A representative excerpt:`
    );
    lines.push(">");
    lines.push(`> "${result.writer.excerpt}"`);
    lines.push("");
    lines.push(
      'This batch does not yet have a KDP listing (`listing.json`) — Crier doesn\'t support text-only categories yet (see `agents/crier/README.md`\'s "Known v2 gap"). The listing step is a manual follow-up until Crier is generalized for text categories.'
    );
  }

  lines.push("");
  lines.push(
    `This PR does not publish anything. A human should read \`batches/${result.batchId}/research.md\`, proof the interior (${
      illustrated ? "`interior.pdf`, `cover-art.png`, and `listing.json`" : "`manuscript.md` and `interior.pdf`"
    }), then either:`
  );
  lines.push("- merge this PR and publish externally (disclosing the AI-generated content per KDP's requirements), or");
  lines.push("- close this PR to discard the batch, or");
  lines.push(
    illustrated
      ? "- replace files in the batch's `images/` folder and push — that retriggers `bindery-crier.yml` to reassemble with the new images."
      : "- hand-edit `manuscript.md` before publishing (re-run Bindery by hand afterward: `npm run bindery -- <batch-id>`)."
  );

  return lines.join("\n");
}
