import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runOpportunityScanner } from "./index.ts";
import { fakeOpportunityScannerClient } from "./testFixtures.ts";

let tempDir: string | undefined;

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("runOpportunityScanner", () => {
  it("writes a report.json/report.md pair and appends a run-log entry", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "opportunity-scanner-test-"));
    const batchesDir = join(tempDir, "batches");
    const reportsDir = join(tempDir, "reports");
    const runLogPath = join(tempDir, "run-log.json");

    const result = await runOpportunityScanner({
      batchesDir,
      reportsDir,
      runLogPath,
      client: fakeOpportunityScannerClient(),
    });

    expect(result.category).toBe("Seasonal Coloring Books");
    expect(result.contentType).toBe("illustrated");

    const reportJson = JSON.parse(readFileSync(result.reportJsonPath, "utf-8"));
    expect(reportJson.selectedCategory).toBe("Seasonal Coloring Books");
    expect(reportJson.candidates).toHaveLength(2);
    expect(reportJson.methodologyNote).toMatch(/live web_search results/i);

    const reportMd = readFileSync(result.reportMdPath, "utf-8");
    expect(reportMd).toContain("Seasonal Coloring Books");
    expect(reportMd).toContain("Candidates passed over");
    expect(reportMd).toContain("Micro-Fiction Flash Story Collections");

    const runLog = JSON.parse(readFileSync(runLogPath, "utf-8"));
    expect(runLog).toHaveLength(1);
    expect(runLog[0].selectedCategory).toBe("Seasonal Coloring Books");
    expect(runLog[0].contentType).toBe("illustrated");
  });

  it("appends to an existing run-log rather than overwriting it", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "opportunity-scanner-test-"));
    const runLogPath = join(tempDir, "run-log.json");
    const options = {
      batchesDir: join(tempDir, "batches"),
      reportsDir: join(tempDir, "reports"),
      runLogPath,
      client: fakeOpportunityScannerClient(),
    };

    await runOpportunityScanner(options);
    await runOpportunityScanner(options);

    const runLog = JSON.parse(readFileSync(runLogPath, "utf-8"));
    expect(runLog).toHaveLength(2);
  });

  it("throws if Claude selects a category with no matching candidate", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "opportunity-scanner-test-"));

    await expect(
      runOpportunityScanner({
        batchesDir: join(tempDir, "batches"),
        reportsDir: join(tempDir, "reports"),
        runLogPath: join(tempDir, "run-log.json"),
        client: fakeOpportunityScannerClient({ selectedCategory: "Nonexistent Category" }),
      })
    ).rejects.toThrow(/no matching candidate/);
  });

  it("passes previously-selected categories from batch manifests as the avoid list", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "opportunity-scanner-test-"));
    const batchesDir = join(tempDir, "batches");
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(join(batchesDir, "some-batch"), { recursive: true });
    writeFileSync(
      join(batchesDir, "some-batch", "manifest.json"),
      JSON.stringify({ opportunityScanner: { category: "Seasonal Coloring Books" } })
    );

    let capturedAvoid: string[] = [];
    const client = fakeOpportunityScannerClient();
    const spyClient = {
      selectCategory: async (avoid: string[]) => {
        capturedAvoid = avoid;
        return client.selectCategory(avoid);
      },
    };

    await runOpportunityScanner({
      batchesDir,
      reportsDir: join(tempDir, "reports"),
      runLogPath: join(tempDir, "run-log.json"),
      client: spyClient,
    });

    expect(capturedAvoid).toEqual(["Seasonal Coloring Books"]);
  });
});
