import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateManifest } from "../../schemas/manifest.ts";
import type { ThemeSelection } from "./claudeClient.ts";
import { runScout } from "./index.ts";
import { fakeClaudeClient } from "./testFixtures.ts";

let tempDir: string | undefined;

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

const fakeAnalysis = {
  competitionLevel: "medium" as const,
  competitionRationale: "Fake rationale for testing.",
  suggestedAngle: "Fake angle for testing.",
  keywordVariants: ["fantasy castles coloring book", "fantasy castles coloring pages"],
};

describe("runScout", () => {
  it("writes research.json, research.md, and a valid manifest.json", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "scout-test-"));

    const result = await runScout("Fantasy Castles", { batchesDir: tempDir, claudeClient: fakeClaudeClient(fakeAnalysis) });

    expect(result.batchId).toBe("fantasy-castles");

    const manifestRaw = JSON.parse(readFileSync(join(result.batchDir, "manifest.json"), "utf-8"));
    const manifest = validateManifest(manifestRaw);
    expect(manifest.stage).toBe("researched");
    expect(manifest.scout?.competitionLevel).toBe("medium");

    const research = JSON.parse(readFileSync(result.researchJsonPath, "utf-8"));
    expect(research.theme).toBe("Fantasy Castles");
    expect(research.methodologyNote).toMatch(/Anthropic API's estimate/i);
    expect(research.keywordVariants).toEqual(fakeAnalysis.keywordVariants);

    const md = readFileSync(result.researchMdPath, "utf-8");
    expect(md).toContain("Fantasy Castles");
  });

  it("appends a numeric suffix instead of overwriting an existing batch", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "scout-test-"));

    const first = await runScout("Fantasy Castles", { batchesDir: tempDir, claudeClient: fakeClaudeClient(fakeAnalysis) });
    const second = await runScout("Fantasy Castles", { batchesDir: tempDir, claudeClient: fakeClaudeClient(fakeAnalysis) });

    expect(first.batchId).toBe("fantasy-castles");
    expect(second.batchId).toBe("fantasy-castles-2");
  });

  it("throws on an empty theme instead of writing anything", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "scout-test-"));
    await expect(runScout("   ", { batchesDir: tempDir, claudeClient: fakeClaudeClient(fakeAnalysis) })).rejects.toThrow();
  });

  it("records the selection rationale when the theme came from an automated selection", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "scout-test-"));

    const selection: ThemeSelection = {
      selectedTheme: "Fantasy Castles",
      selectionRationale: "Best differentiation potential of the candidates.",
      rankings: [
        { theme: "Fantasy Castles", score: 90, rationale: "Strong, specific angle." },
        { theme: "Cats", score: 20, rationale: "Saturated niche." },
      ],
    };

    const result = await runScout("Fantasy Castles", {
      batchesDir: tempDir,
      claudeClient: fakeClaudeClient(fakeAnalysis),
      selection,
    });

    const manifest = JSON.parse(readFileSync(join(result.batchDir, "manifest.json"), "utf-8"));
    expect(manifest.scout.selectionRationale).toBe(selection.selectionRationale);

    const md = readFileSync(result.researchMdPath, "utf-8");
    expect(md).toContain("Why this theme was selected");
  });
});
