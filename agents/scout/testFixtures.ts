import type { ClaudeClient, ThemeAnalysis } from "./claudeClient.ts";

/** Test-only fixture: a fake Claude client so tests never need ANTHROPIC_API_KEY or a real network call. */
export function fakeClaudeClient(analysis: Partial<ThemeAnalysis> = {}): ClaudeClient {
  const resolved: ThemeAnalysis = {
    competitionLevel: "medium",
    competitionRationale: "Fake rationale for testing.",
    suggestedAngle: "Fake angle for testing.",
    keywordVariants: ["fake theme coloring book", "fake theme coloring pages"],
    ...analysis,
  };
  return {
    analyzeTheme: async () => resolved,
    selectTheme: async () => {
      throw new Error("fakeClaudeClient: selectTheme not stubbed for this test");
    },
    generateCandidateThemes: async () => {
      throw new Error("fakeClaudeClient: generateCandidateThemes not stubbed for this test");
    },
  };
}
