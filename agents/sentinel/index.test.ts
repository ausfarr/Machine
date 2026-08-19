import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runSentinel } from "./index.ts";
import { fakeSentinelClient } from "./testFixtures.ts";

let tempDir: string | undefined;

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

/** Sets up a real git repo with one committed file, then returns a real `git diff`-produced patch that changes it — so patch-apply tests exercise the actual `git apply` codepath, not a hand-crafted diff string. */
function setupRepoWithRealPatch(): { repoRoot: string; patch: string; original: string; modified: string } {
  const repoRoot = mkdtempSync(join(tmpdir(), "sentinel-repo-"));
  execFileSync("git", ["init", "-q"], { cwd: repoRoot });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: repoRoot });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: repoRoot });

  const original = "line1\nline2\nline3\n";
  const modified = "line1\nCHANGED\nline3\n";

  writeFileSync(join(repoRoot, "foo.txt"), original);
  execFileSync("git", ["add", "foo.txt"], { cwd: repoRoot });
  execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: repoRoot });

  writeFileSync(join(repoRoot, "foo.txt"), modified);
  const patch = execFileSync("git", ["diff"], { cwd: repoRoot }).toString();
  execFileSync("git", ["checkout", "--", "foo.txt"], { cwd: repoRoot }); // back to `original` before the test applies the patch itself

  return { repoRoot, patch, original, modified };
}

describe("runSentinel", () => {
  it("applies a confident, real patch to the working tree", async () => {
    const { repoRoot, patch, modified } = setupRepoWithRealPatch();
    tempDir = repoRoot;

    const result = await runSentinel({
      failureLog: "foo.txt(2,1): error TS1: something's wrong",
      repoRoot,
      reportPath: join(repoRoot, "report.md"),
      sentinelClient: fakeSentinelClient({ summary: "Fix foo.txt", confidentFix: true, patch }),
    });

    expect(result.patchApplied).toBe(true);
    expect(result.confidentFix).toBe(true);
    expect(readFileSync(join(repoRoot, "foo.txt"), "utf-8")).toBe(modified);

    const report = readFileSync(join(repoRoot, "report.md"), "utf-8");
    expect(report).toContain("Fix foo.txt");
    expect(report).toContain("Sentinel applied the patch");
  });

  it("fails loudly, without touching the working tree, when the patch doesn't apply cleanly — and keeps the report", async () => {
    const { repoRoot, original } = setupRepoWithRealPatch();
    tempDir = repoRoot;
    const reportPath = join(repoRoot, "report.md");

    const garbagePatch = "not a real diff at all";

    await expect(
      runSentinel({
        failureLog: "foo.txt(2,1): error",
        repoRoot,
        reportPath,
        sentinelClient: fakeSentinelClient({ summary: "Bad patch", confidentFix: true, patch: garbagePatch }),
      })
    ).rejects.toThrow(/failed to apply/);

    expect(readFileSync(join(repoRoot, "foo.txt"), "utf-8")).toBe(original);
    // The diagnosis is preserved even though the patch failed to apply.
    expect(readFileSync(reportPath, "utf-8")).toContain("Bad patch");
  });

  it("leaves the working tree untouched and reports honestly when Claude isn't confident in a fix", async () => {
    const { repoRoot, original } = setupRepoWithRealPatch();
    tempDir = repoRoot;
    const reportPath = join(repoRoot, "report.md");

    const result = await runSentinel({
      failureLog: "some flaky failure with no clear cause",
      repoRoot,
      reportPath,
      sentinelClient: fakeSentinelClient({ summary: "Investigate flaky failure", confidentFix: false, patch: "" }),
    });

    expect(result.patchApplied).toBe(false);
    expect(readFileSync(join(repoRoot, "foo.txt"), "utf-8")).toBe(original);
    expect(readFileSync(reportPath, "utf-8")).toContain("not confident enough");
  });
});
