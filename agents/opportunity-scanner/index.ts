import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { slugify } from "../scout/slug.ts";
import { AnthropicOpportunityScannerClient, type CategorySelection, type OpportunityScannerClient } from "./claudeClient.ts";

export interface OpportunityScannerRunOptions {
  batchesDir?: string;
  reportsDir?: string;
  runLogPath?: string;
  /** Injected for tests; defaults to a real Anthropic-backed client. */
  client?: OpportunityScannerClient;
}

export interface OpportunityScannerRunResult {
  category: string;
  contentType: "illustrated" | "text";
  illustrationStyle?: "coloring-book" | "picture-book";
  selectionRationale: string;
  reportJsonPath: string;
  reportMdPath: string;
  completedAt: string;
}

/** One real entry per attempted run, appended for Ledger — mirrors agents/sentinel/run-log.json's pattern. */
export interface OpportunityScannerRunLogEntry {
  at: string;
  selectedCategory: string;
  contentType: "illustrated" | "text";
  illustrationStyle?: "coloring-book" | "picture-book";
  candidateCount: number;
  reportJsonPath: string;
  reportMdPath: string;
}

interface CategoryReport extends CategorySelection {
  generatedAt: string;
  methodologyNote: string;
}

/** Categories already selected in past runs, so Opportunity Scanner doesn't default back to the same category week after week without cause. Reads batch manifests directly rather than the reports dir, since a report can exist without a batch ever having been created downstream. */
function recentCategories(batchesDir: string): string[] {
  if (!existsSync(batchesDir)) return [];
  const categories: string[] = [];
  for (const entry of readdirSync(batchesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(batchesDir, entry.name, "manifest.json");
    if (!existsSync(manifestPath)) continue;
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
      if (typeof manifest?.opportunityScanner?.category === "string") {
        categories.push(manifest.opportunityScanner.category);
      }
    } catch {
      // A broken manifest is Ledger's problem to report; here it just doesn't contribute to the avoid list.
    }
  }
  return categories;
}

/** Appends -2, -3, ... if today's report folder already exists, so a second run on the same day never overwrites the first. */
function uniqueReportId(category: string, reportsDir: string): string {
  const day = new Date().toISOString().slice(0, 10);
  const base = `${day}-${slugify(category)}`;
  let candidate = base;
  let suffix = 2;
  while (existsSync(join(reportsDir, candidate))) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function renderMarkdown(report: CategoryReport): string {
  const { selectedCategory, selectionRationale, candidates, sourcesConsulted, generatedAt, methodologyNote } = report;
  const selected = candidates.find((c) => c.category === selectedCategory);
  const rejected = candidates.filter((c) => c.category !== selectedCategory);

  return `# Opportunity Scanner Report: ${selectedCategory}

Generated: ${generatedAt}

> ${methodologyNote}

## Selected category: ${selectedCategory} (${selected?.contentType ?? "unknown"}${selected?.illustrationStyle ? `, ${selected.illustrationStyle}` : ""})

${selectionRationale}

## Why this one over the alternatives

${candidates
  .map((c) => `- **${c.category}** (${c.contentType}, score ${c.score}${c.groundedInLiveSearch ? ", live-search-grounded" : ", model estimate"}): ${c.rationale}`)
  .join("\n")}

## Candidates passed over

${rejected.length > 0 ? rejected.map((c) => `- **${c.category}**: ${c.rationale}`).join("\n") : "(none — only one candidate was proposed this run)"}

## Live sources consulted

${sourcesConsulted.length > 0 ? sourcesConsulted.map((s) => `- ${s}`).join("\n") : "(none returned)"}

## Next step

Opportunity Scanner selected this category automatically via the Anthropic
API with the web_search tool (see CLAUDE.md's Authorized external APIs
section) — there is no human greenlight step before Scout runs within it.
A human still reviews the resulting batch at the pull request stage,
before anything is published.
`;
}

function appendRunLog(runLogPath: string, entry: OpportunityScannerRunLogEntry): void {
  let existing: OpportunityScannerRunLogEntry[] = [];
  if (existsSync(runLogPath)) {
    try {
      const parsed = JSON.parse(readFileSync(runLogPath, "utf-8"));
      if (Array.isArray(parsed)) existing = parsed;
    } catch {
      // A corrupt run-log shouldn't block a real run from being recorded — start fresh rather than crashing.
    }
  }
  mkdirSync(dirname(runLogPath), { recursive: true });
  writeFileSync(runLogPath, JSON.stringify([...existing, entry], null, 2));
}

/**
 * Picks exactly one KDP category/format to pursue this week, grounded in
 * live web_search signal, and logs every candidate considered (including
 * the ones passed over) for auditability. Runs before Scout: Scout then
 * picks a specific theme/niche within whatever category this selects.
 */
export async function runOpportunityScanner(options: OpportunityScannerRunOptions = {}): Promise<OpportunityScannerRunResult> {
  const batchesDir = options.batchesDir ?? "batches";
  const reportsDir = options.reportsDir ?? join("agents", "opportunity-scanner", "reports");
  const runLogPath = options.runLogPath ?? join("agents", "opportunity-scanner", "run-log.json");
  const client = options.client ?? new AnthropicOpportunityScannerClient();

  const avoidCategories = recentCategories(batchesDir);
  const selection = await client.selectCategory(avoidCategories);

  const selected = selection.candidates.find((c) => c.category === selection.selectedCategory);
  if (!selected) {
    throw new Error(`Opportunity Scanner: selected category "${selection.selectedCategory}" has no matching candidate.`);
  }

  const generatedAt = new Date().toISOString();
  const report: CategoryReport = {
    ...selection,
    generatedAt,
    methodologyNote:
      "The scoring and rationale below are grounded in live web_search results where marked, and the Anthropic API's own estimate otherwise — never live Amazon internal sales data. Opportunity Scanner discloses this so the estimate is never mistaken for certainty.",
  };

  const reportId = uniqueReportId(selection.selectedCategory, reportsDir);
  const reportDir = join(reportsDir, reportId);
  mkdirSync(reportDir, { recursive: true });

  const reportJsonPath = join(reportDir, "report.json");
  const reportMdPath = join(reportDir, "report.md");
  writeFileSync(reportJsonPath, JSON.stringify(report, null, 2));
  writeFileSync(reportMdPath, renderMarkdown(report));

  appendRunLog(runLogPath, {
    at: generatedAt,
    selectedCategory: selection.selectedCategory,
    contentType: selected.contentType,
    illustrationStyle: selected.illustrationStyle,
    candidateCount: selection.candidates.length,
    reportJsonPath,
    reportMdPath,
  });

  return {
    category: selection.selectedCategory,
    contentType: selected.contentType,
    illustrationStyle: selected.illustrationStyle,
    selectionRationale: selection.selectionRationale,
    reportJsonPath,
    reportMdPath,
    completedAt: generatedAt,
  };
}
