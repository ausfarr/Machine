import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateManifest } from "../../schemas/manifest.ts";
import { writeValidTestCoverArt, writeValidTestImages } from "../bindery/testFixtures.ts";
import { runBindery } from "../bindery/index.ts";
import { runLoom } from "../loom/index.ts";
import { runScout } from "../scout/index.ts";
import { fakeClaudeClient } from "../scout/testFixtures.ts";
import { runWriter } from "../writer/index.ts";
import { fakeWriterClient } from "../writer/testFixtures.ts";
import { runCrier } from "./index.ts";

let tempDir: string | undefined;

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

async function scoutLoomBindery(batchesDir: string, promptCount = 20) {
  const scouted = await runScout("Fantasy Castles", { batchesDir, claudeClient: fakeClaudeClient() });
  runLoom(scouted.batchId, { batchesDir, promptCount });
  await writeValidTestImages(join(batchesDir, scouted.batchId, "images"), promptCount);
  await writeValidTestCoverArt(join(batchesDir, scouted.batchId, "cover-art.png"));
  await runBindery(scouted.batchId, { batchesDir });
  return scouted.batchId;
}

describe("runCrier", () => {
  it("writes a valid listing.json and moves the batch to stage listed", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "crier-e2e-"));
    const batchId = await scoutLoomBindery(tempDir, 20);

    const result = runCrier(batchId, { batchesDir: tempDir });

    const manifestRaw = JSON.parse(readFileSync(join(result.batchDir, "manifest.json"), "utf-8"));
    const manifest = validateManifest(manifestRaw);
    expect(manifest.stage).toBe("listed");
    expect(manifest.crier?.keywords).toHaveLength(7);
    expect(manifest.crier?.aiGeneratedDisclosure).toBe(true);

    const listing = JSON.parse(readFileSync(result.listingPath, "utf-8"));
    expect(listing.title).toContain("Fantasy Castles");
    expect(listing.aiGeneratedDisclosure).toBe(true);
    expect(listing.disclosureNote).toMatch(/AI/);
    expect(listing.categories.length).toBeGreaterThan(0);
  }, 60000);

  it("refuses to run on a batch that isn't at stage assembled", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "crier-e2e-"));
    const scouted = await runScout("Fantasy Castles", { batchesDir: tempDir, claudeClient: fakeClaudeClient() });
    expect(() => runCrier(scouted.batchId, { batchesDir: tempDir })).toThrow(/requires stage "assembled"/);
  });

  it("throws if the batch does not exist", () => {
    tempDir = mkdtempSync(join(tmpdir(), "crier-e2e-"));
    expect(() => runCrier("no-such-batch", { batchesDir: tempDir })).toThrow(/No batch found/);
  });

  it("refuses to run on a text-only (Writer-sourced) batch rather than mis-describing it as a coloring book", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "crier-e2e-"));
    const scouted = await runScout("Autumn Reflections", { batchesDir: tempDir, claudeClient: fakeClaudeClient() });

    const manifestPath = join(scouted.batchDir, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    manifest.opportunityScanner = {
      category: "Poetry Collections",
      contentType: "text",
      selectionRationale: "Test fixture.",
      reportJsonPath: "fake.json",
      reportMdPath: "fake.md",
      completedAt: manifest.createdAt,
    };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    await runWriter(scouted.batchId, { batchesDir: tempDir, client: fakeWriterClient() });
    await runBindery(scouted.batchId, { batchesDir: tempDir });

    expect(() => runCrier(scouted.batchId, { batchesDir: tempDir })).toThrow(/text-only category/);
  });
});
