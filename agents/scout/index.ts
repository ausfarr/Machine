import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { validateManifest, type BatchManifest } from "../../schemas/manifest.ts";
import { assessCompetition, generateKeywordVariants, suggestAngle } from "./heuristics.ts";
import { uniqueBatchId } from "./slug.ts";

export interface ScoutRunOptions {
  /** Repo-root-relative or absolute path to the batches directory. Defaults to "batches". */
  batchesDir?: string;
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
  keywordVariants: string[];
  competition: ReturnType<typeof assessCompetition>;
  suggestedAngle: string;
}

function renderMarkdown(report: ResearchReport): string {
  const { theme, generatedAt, competition, suggestedAngle, keywordVariants, methodologyNote } = report;
  return `# Scout Research Report: ${theme}

Generated: ${generatedAt}

> ${methodologyNote}

## Competition estimate: ${competition.level.toUpperCase()}

${competition.rationale}

- Word count: ${competition.signals.wordCount}
- Matches known saturated niche terms: ${competition.signals.matchesKnownSaturatedNiche ? competition.signals.matchedSaturatedTerms.join(", ") : "none"}
- Differentiating style/audience modifier present: ${competition.signals.hasSpecificityModifier ? competition.signals.matchedModifiers.join(", ") : "none"}

## Suggested angle

${suggestedAngle}

## Candidate keyword variants

${keywordVariants.map((k) => `- ${k}`).join("\n")}

## Next step

This report does not greenlight anything by itself. A human reviews it and
decides whether to move this theme forward to Loom.
`;
}

export function runScout(theme: string, options: ScoutRunOptions = {}): ScoutRunResult {
  const trimmedTheme = theme.trim();
  if (!trimmedTheme) {
    throw new Error("Scout requires a non-empty theme.");
  }

  const batchesDir = options.batchesDir ?? "batches";
  const batchId = uniqueBatchId(trimmedTheme, batchesDir);
  const batchDir = join(batchesDir, batchId);
  mkdirSync(batchDir, { recursive: true });

  const generatedAt = new Date().toISOString();
  const competition = assessCompetition(trimmedTheme);
  const suggestedAngle = suggestAngle(trimmedTheme);
  const keywordVariants = generateKeywordVariants(trimmedTheme);

  const report: ResearchReport = {
    theme: trimmedTheme,
    generatedAt,
    methodologyNote:
      "Competition and angle signals below are heuristic estimates generated locally from the theme text itself — not live Amazon/Google search-volume data. Scout calls no external API.",
    keywordVariants,
    competition,
    suggestedAngle,
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
      competitionLevel: competition.level,
      suggestedAngle,
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
