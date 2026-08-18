import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { validateManifest, type BatchManifest } from "../../schemas/manifest.ts";
import { AnthropicClaudeClient, type ClaudeClient, type ThemeSelection } from "./claudeClient.ts";
import { uniqueBatchId } from "./slug.ts";

export interface ScoutRunOptions {
  /** Repo-root-relative or absolute path to the batches directory. Defaults to "batches". */
  batchesDir?: string;
  /** Injected for tests; defaults to a real Anthropic-backed client. */
  claudeClient?: ClaudeClient;
  /** When this theme came from an automated queue selection, carries the rationale for the record. */
  selection?: ThemeSelection;
}

export interface ScoutRunResult {
  batchId: string;
  batchDir: string;
  manifest: BatchManifest;
  researchJsonPath: string;
  researchMdPath: string;
}

interface ResearchReport {
  theme: string;
  generatedAt: string;
  methodologyNote: string;
  competitionLevel: string;
  competitionRationale: string;
  suggestedAngle: string;
  keywordVariants: string[];
  selection?: {
    rationale: string;
    rankings: ThemeSelection["rankings"];
  };
}

function renderMarkdown(report: ResearchReport): string {
  const { theme, generatedAt, competitionLevel, competitionRationale, suggestedAngle, keywordVariants, methodologyNote, selection } =
    report;
  return `# Scout Research Report: ${theme}

Generated: ${generatedAt}

> ${methodologyNote}

## Competition estimate: ${competitionLevel.toUpperCase()}

${competitionRationale}

## Suggested angle

${suggestedAngle}

## Candidate keyword variants

${keywordVariants.map((k) => `- ${k}`).join("\n")}
${
  selection
    ? `\n## Why this theme was selected\n\n${selection.rationale}\n\n### All candidates considered\n\n${selection.rankings
        .map((r) => `- **${r.theme}** (score ${r.score}): ${r.rationale}`)
        .join("\n")}\n`
    : ""
}
## Next step

Scout selected and researched this theme automatically via the Anthropic
API (see CLAUDE.md's Authorized external APIs section) — there is no
separate human greenlight step before Loom runs on it. A human still
reviews the batch at the pull request stage, before anything is published.
`;
}

export async function runScout(theme: string, options: ScoutRunOptions = {}): Promise<ScoutRunResult> {
  const trimmedTheme = theme.trim();
  if (!trimmedTheme) {
    throw new Error("Scout requires a non-empty theme.");
  }

  const batchesDir = options.batchesDir ?? "batches";
  const claudeClient = options.claudeClient ?? new AnthropicClaudeClient();

  const batchId = uniqueBatchId(trimmedTheme, batchesDir);
  const batchDir = join(batchesDir, batchId);

  const generatedAt = new Date().toISOString();
  const analysis = await claudeClient.analyzeTheme(trimmedTheme);

  mkdirSync(batchDir, { recursive: true });

  const report: ResearchReport = {
    theme: trimmedTheme,
    generatedAt,
    methodologyNote:
      "Competition, angle, and keyword signals below are the Anthropic API's estimate, generated from its own knowledge — not live Amazon/Google search-volume data. Scout discloses this so the estimate is never mistaken for real market data.",
    competitionLevel: analysis.competitionLevel,
    competitionRationale: analysis.competitionRationale,
    suggestedAngle: analysis.suggestedAngle,
    keywordVariants: analysis.keywordVariants,
    selection: options.selection
      ? { rationale: options.selection.selectionRationale, rankings: options.selection.rankings }
      : undefined,
  };

  const researchJsonPath = join(batchDir, "research.json");
  const researchMdPath = join(batchDir, "research.md");
  writeFileSync(researchJsonPath, JSON.stringify(report, null, 2));
  writeFileSync(researchMdPath, renderMarkdown(report));

  const manifestCandidate: BatchManifest = {
    batchId,
    stage: "researched",
    theme: trimmedTheme,
    createdAt: generatedAt,
    updatedAt: generatedAt,
    scout: {
      reportJsonPath: researchJsonPath,
      reportMdPath: researchMdPath,
      competitionLevel: analysis.competitionLevel,
      suggestedAngle: analysis.suggestedAngle,
      selectionRationale: options.selection?.selectionRationale,
      completedAt: generatedAt,
    },
  };

  // Fail loudly rather than writing a manifest that doesn't match the
  // schema or claims a stage its own data doesn't back up.
  const manifest = validateManifest(manifestCandidate);

  const manifestPath = join(batchDir, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  return { batchId, batchDir, manifest, researchJsonPath, researchMdPath };
}
