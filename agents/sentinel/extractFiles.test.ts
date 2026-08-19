import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { extractCandidateFiles } from "./extractFiles.ts";

let tempDir: string | undefined;

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("extractCandidateFiles", () => {
  it("extracts a tsc-style path and drops the (line,col) suffix", () => {
    tempDir = mkdtempSync(join(tmpdir(), "sentinel-test-"));
    mkdirSync(join(tempDir, "agents", "foo"), { recursive: true });
    writeFileSync(join(tempDir, "agents", "foo", "bar.ts"), "export {};");

    const log = `agents/foo/bar.ts(12,5): error TS2345: Argument of type 'string' is not assignable.`;
    expect(extractCandidateFiles(log, tempDir)).toEqual(["agents/foo/bar.ts"]);
  });

  it("extracts an absolute stack-trace path and makes it repo-relative", () => {
    tempDir = mkdtempSync(join(tmpdir(), "sentinel-test-"));
    mkdirSync(join(tempDir, "agents", "foo"), { recursive: true });
    writeFileSync(join(tempDir, "agents", "foo", "bar.test.ts"), "export {};");

    const log = `AssertionError: expected 1 to be 2\n    at Object.<anonymous> (${tempDir}/agents/foo/bar.test.ts:34:10)`;
    expect(extractCandidateFiles(log, tempDir)).toEqual(["agents/foo/bar.test.ts"]);
  });

  it("dedupes a path mentioned multiple times", () => {
    tempDir = mkdtempSync(join(tmpdir(), "sentinel-test-"));
    writeFileSync(join(tempDir, "one.ts"), "export {};");

    const log = `one.ts(1,1): error TS1\none.ts(2,2): error TS2`;
    expect(extractCandidateFiles(log, tempDir)).toEqual(["one.ts"]);
  });

  it("ignores a path that doesn't exist on disk", () => {
    tempDir = mkdtempSync(join(tmpdir(), "sentinel-test-"));
    const log = `ghost.ts(1,1): error TS1`;
    expect(extractCandidateFiles(log, tempDir)).toEqual([]);
  });

  it("ignores node_modules paths", () => {
    tempDir = mkdtempSync(join(tmpdir(), "sentinel-test-"));
    mkdirSync(join(tempDir, "node_modules", "somepkg"), { recursive: true });
    writeFileSync(join(tempDir, "node_modules", "somepkg", "index.ts"), "export {};");

    const log = `node_modules/somepkg/index.ts(1,1): error TS1`;
    expect(extractCandidateFiles(log, tempDir)).toEqual([]);
  });

  it("caps results at 5 files", () => {
    tempDir = mkdtempSync(join(tmpdir(), "sentinel-test-"));
    let log = "";
    for (let i = 0; i < 8; i++) {
      writeFileSync(join(tempDir, `file${i}.ts`), "export {};");
      log += `file${i}.ts(1,1): error TS1\n`;
    }
    expect(extractCandidateFiles(log, tempDir)).toHaveLength(5);
  });
});
