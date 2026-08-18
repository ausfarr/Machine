import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateManifest } from "../../schemas/manifest.ts";
import { runScout } from "./index.ts";

let tempDir: string | undefined;

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("runScout", () => {
  it("writes research.json, research.md, and a valid manifest.json", () => {
    tempDir = mkdtempSync(join(tmpdir(), "scout-test-"));

    const result = runScout("Fantasy Castles", { batchesDir: tempDir });

    expect(result.batchId).toBe("fantasy-castles");

    const manifestRaw = JSON.parse(
      readFileSync(join(result.batchDir, "manifest.json"), "utf-8")
    );
    const manifest = validateManifest(manifestRaw);
    expect(manifest.stage).toBe("researched");
    expect(manifest.scout?.competitionLevel).toBeDefined();

    const research = JSON.parse(readFileSync(result.researchJsonPath, "utf-8"));
    expect(research.theme).toBe("Fantasy Castles");
    expect(research.methodologyNote).toMatch(/no external API/i);

    const md = readFileSync(result.researchMdPath, "utf-8");
    expect(md).toContain("Fantasy Castles");
  });

  it("appends a numeric suffix instead of overwriting an existing batch", () => {
    tempDir = mkdtempSync(join(tmpdir(), "scout-test-"));

    const first = runScout("Fantasy Castles", { batchesDir: tempDir });
    const second = runScout("Fantasy Castles", { batchesDir: tempDir });

    expect(first.batchId).toBe("fantasy-castles");
    expect(second.batchId).toBe("fantasy-castles-2");
  });

  it("throws on an empty theme instead of writing anything", () => {
    tempDir = mkdtempSync(join(tmpdir(), "scout-test-"));
    expect(() => runScout("   ", { batchesDir: tempDir })).toThrow();
  });
});
