import type { CategorySelection, OpportunityScannerClient } from "./claudeClient.ts";

/** Test-only fixture: a fake client so tests never need ANTHROPIC_API_KEY or a real network call. */
export function fakeOpportunityScannerClient(selection: Partial<CategorySelection> = {}): OpportunityScannerClient {
  const resolved: CategorySelection = {
    candidates: [
      {
        category: "Seasonal Coloring Books",
        contentType: "illustrated",
        illustrationStyle: "coloring-book",
        score: 82,
        rationale: "Fake rationale for testing.",
        groundedInLiveSearch: true,
      },
      {
        category: "Micro-Fiction Flash Story Collections",
        contentType: "text",
        score: 55,
        rationale: "Fake rejected-candidate rationale.",
        groundedInLiveSearch: false,
      },
    ],
    selectedCategory: "Seasonal Coloring Books",
    selectionRationale: "Fake selection rationale for testing.",
    sourcesConsulted: ["Fake Source — https://example.com/kdp-bestsellers"],
    ...selection,
  };
  return {
    selectCategory: async () => resolved,
  };
}
