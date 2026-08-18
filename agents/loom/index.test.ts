import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateManifest } from "../../schemas/manifest.ts";
import { runScout } from "../scout/index.ts";
import { runLoom } from "./index.ts";

let tempDir: string | undefined;

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("runLoom", () => {
  it("moves a researched batch to stage prompted with a valid prompt batch", () => {
    tempDir = mkdtempSync(join(tmpdir(), "loom-test-"));
    const scouted = runScout("Fantasy Castles", { batchesDir: tempDir });

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

    const frontBack = readFileSync(result.frontBackMatterPath, "utf-8");
    expect(frontBack).toContain("Fantasy Castles");
  });

  it("refuses to run on a batch that isn't at stage researched", () => {
    tempDir = mkdtempSync(join(tmpdir(), "loom-test-"));
    const scouted = runScout("Fantasy Castles", { batchesDir: tempDir });
    runLoom(scouted.batchId, { batchesDir: tempDir });

    expect(() => runLoom(scouted.batchId, { batchesDir: tempDir })).toThrow(/stage "prompted"/);
  });

  it("throws if the batch does not exist", () => {
    tempDir = mkdtempSync(join(tmpdir(), "loom-test-"));
    expect(() => runLoom("no-such-batch", { batchesDir: tempDir })).toThrow(/No batch found/);
  });

  it("rejects an out-of-range prompt count", () => {
    tempDir = mkdtempSync(join(tmpdir(), "loom-test-"));
    const scouted = runScout("Fantasy Castles", { batchesDir: tempDir });
    expect(() => runLoom(scouted.batchId, { batchesDir: tempDir, promptCount: 10 })).toThrow(/between 20 and 30/);
  });
});
