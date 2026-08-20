import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateManifest } from "../../schemas/manifest.ts";
import { runScout } from "../scout/index.ts";
import { fakeClaudeClient } from "../scout/testFixtures.ts";
import { runLoom } from "./index.ts";

let tempDir: string | undefined;

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("runLoom", () => {
  it("moves a researched batch to stage prompted with a valid prompt batch", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "loom-test-"));
    const scouted = await runScout("Fantasy Castles", { batchesDir: tempDir, claudeClient: fakeClaudeClient() });

    const result = runLoom(scouted.batchId, { batchesDir: tempDir });

    const manifestRaw = JSON.parse(readFileSync(join(result.batchDir, "manifest.json"), "utf-8"));
    const manifest = validateManifest(manifestRaw);
    expect(manifest.stage).toBe("prompted");
    expect(manifest.loom?.promptCount).toBe(24);

    const promptsFile = JSON.parse(readFileSync(result.promptsPath, "utf-8"));
    expect(promptsFile.prompts).toHaveLength(24);
    expect(promptsFile.prompts[0].prompt).toContain("Fantasy Castles");
    // every prompt must be unique text
    const promptTexts = promptsFile.prompts.map((p: { prompt: string }) => p.prompt);
    expect(new Set(promptTexts).size).toBe(promptTexts.length);
    expect(promptsFile.cover.prompt.toLowerCase()).toContain("fantasy castles");
    expect(promptsFile.cover.prompt).toContain("Fantasy Castles: A Coloring Book");

    const frontBack = readFileSync(result.frontBackMatterPath, "utf-8");
    expect(frontBack).toContain("Fantasy Castles");
  });

  it("refuses to run on a batch that isn't at stage researched", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "loom-test-"));
    const scouted = await runScout("Fantasy Castles", { batchesDir: tempDir, claudeClient: fakeClaudeClient() });
    runLoom(scouted.batchId, { batchesDir: tempDir });

    expect(() => runLoom(scouted.batchId, { batchesDir: tempDir })).toThrow(/stage "prompted"/);
  });

  it("throws if the batch does not exist", () => {
    tempDir = mkdtempSync(join(tmpdir(), "loom-test-"));
    expect(() => runLoom("no-such-batch", { batchesDir: tempDir })).toThrow(/No batch found/);
  });

  it("rejects an out-of-range prompt count", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "loom-test-"));
    const scouted = await runScout("Fantasy Castles", { batchesDir: tempDir, claudeClient: fakeClaudeClient() });
    expect(() => runLoom(scouted.batchId, { batchesDir: tempDir, promptCount: 0 })).toThrow(/between 1 and 30/);
    expect(() => runLoom(scouted.batchId, { batchesDir: tempDir, promptCount: 31 })).toThrow(/between 1 and 30/);
  });

  it("allows a small prompt count for testing", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "loom-test-"));
    const scouted = await runScout("Fantasy Castles", { batchesDir: tempDir, claudeClient: fakeClaudeClient() });
    const result = runLoom(scouted.batchId, { batchesDir: tempDir, promptCount: 5 });
    expect(result.manifest.loom?.promptCount).toBe(5);
  });

  it("defaults to coloring-book style when the batch has no Opportunity Scanner data", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "loom-test-"));
    const scouted = await runScout("Fantasy Castles", { batchesDir: tempDir, claudeClient: fakeClaudeClient() });

    const result = runLoom(scouted.batchId, { batchesDir: tempDir, promptCount: 5 });

    const promptsFile = JSON.parse(readFileSync(result.promptsPath, "utf-8"));
    expect(promptsFile.illustrationStyle).toBe("coloring-book");
    expect(promptsFile.cover.prompt).toContain("Fantasy Castles: A Coloring Book");
    expect(promptsFile.styleGuidance).toMatch(/black-and-white/i);
  });

  it("uses picture-book prompt style when Opportunity Scanner selected it", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "loom-test-"));
    const scouted = await runScout("Fantasy Castles", { batchesDir: tempDir, claudeClient: fakeClaudeClient() });

    const manifestPath = join(scouted.batchDir, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    manifest.opportunityScanner = {
      category: "Children's Picture Books",
      contentType: "illustrated",
      illustrationStyle: "picture-book",
      selectionRationale: "Test fixture.",
      reportJsonPath: "fake.json",
      reportMdPath: "fake.md",
      completedAt: manifest.createdAt,
    };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const result = runLoom(scouted.batchId, { batchesDir: tempDir, promptCount: 5 });

    const promptsFile = JSON.parse(readFileSync(result.promptsPath, "utf-8"));
    expect(promptsFile.illustrationStyle).toBe("picture-book");
    expect(promptsFile.cover.prompt).toContain("Fantasy Castles: A Picture Book");
    expect(promptsFile.styleGuidance).toMatch(/picture-book/i);
    expect(promptsFile.styleGuidance).not.toMatch(/black-and-white/i);

    const frontBack = readFileSync(result.frontBackMatterPath, "utf-8");
    expect(frontBack).toContain("A Picture Book");
  });
});
