import { describe, expect, it } from "vitest";
import type { ClaudeClient, ThemeSelection } from "./claudeClient.ts";
import { selectTheme } from "./themeSelection.ts";

function fakeClient(selection: ThemeSelection): ClaudeClient {
  return {
    selectTheme: async () => selection,
    analyzeTheme: async () => {
      throw new Error("not used in these tests");
    },
  };
}

describe("selectTheme", () => {
  it("returns Claude's selection when it names a real candidate", async () => {
    const selection: ThemeSelection = {
      selectedTheme: "Cozy Cabins",
      selectionRationale: "Underused angle with clear differentiation.",
      rankings: [
        { theme: "Cozy Cabins", score: 85, rationale: "Specific, low competition." },
        { theme: "Cats", score: 15, rationale: "Saturated niche." },
      ],
    };

    const result = await selectTheme(["Cozy Cabins", "Cats"], fakeClient(selection));
    expect(result.selectedTheme).toBe("Cozy Cabins");
  });

  it("is case/whitespace tolerant when matching the selection against candidates", async () => {
    const selection: ThemeSelection = {
      selectedTheme: "  cozy cabins  ",
      selectionRationale: "x",
      rankings: [],
    };

    await expect(selectTheme(["Cozy Cabins"], fakeClient(selection))).resolves.toBeDefined();
  });

  it("throws if Claude selects a theme that wasn't in the candidate list", async () => {
    const selection: ThemeSelection = {
      selectedTheme: "Made Up Theme",
      selectionRationale: "x",
      rankings: [],
    };

    await expect(selectTheme(["Cozy Cabins", "Cats"], fakeClient(selection))).rejects.toThrow(/isn't one of the queued candidates/);
  });

  it("throws on an empty candidate list", async () => {
    await expect(selectTheme([], fakeClient({ selectedTheme: "x", selectionRationale: "x", rankings: [] }))).rejects.toThrow(
      /at least one candidate/
    );
  });
});
