import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateManifest } from "../../schemas/manifest.ts";
import { runScout } from "../scout/index.ts";
import { fakeClaudeClient } from "../scout/testFixtures.ts";
import { runWriter } from "./index.ts";
import { fakeWriterClient } from "./testFixtures.ts";

let tempDir: string | undefined;

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

/** Seeds a researched batch and marks it text-only, the way the real pipeline would after Opportunity Scanner + Scout run. */
async function seedTextBatch(batchesDir: string, theme = "Autumn Reflections") {
  const scouted = await runScout(theme, { batchesDir, claudeClient: fakeClaudeClient() });
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
  return scouted;
}

describe("runWriter", () => {
  it("writes manuscript.json/manuscript.md and moves the batch to stage manuscripted", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "writer-test-"));
    const scouted = await seedTextBatch(tempDir);

    const result = await runWriter(scouted.batchId, { batchesDir: tempDir, client: fakeWriterClient() });

    const manifest = validateManifest(JSON.parse(readFileSync(join(result.batchDir, "manifest.json"), "utf-8")));
    expect(manifest.stage).toBe("manuscripted");
    expect(manifest.writer?.sectionCount).toBe(2);
    expect(manifest.writer?.aiGeneratedDisclosure).toBe(true);
    expect(manifest.writer?.proofreadRecommended).toBe(true);
    expect(manifest.writer?.wordCount).toBeGreaterThan(0);
    expect(manifest.writer?.excerpt).toContain("This is fake body text");

    const manuscriptJson = JSON.parse(readFileSync(result.manuscriptJsonPath, "utf-8"));
    expect(manuscriptJson.theme).toBe("Autumn Reflections");
    expect(manuscriptJson.category).toBe("Poetry Collections");
    expect(manuscriptJson.sections).toHaveLength(2);
    expect(manuscriptJson.sections[0].index).toBe(1);

    const md = readFileSync(result.manuscriptMdPath, "utf-8");
    expect(md).toContain("Autumn Reflections");
    expect(md).toContain("Fake Section One");
    expect(md).toContain("Fake Section Two");
    expect(md).toContain("AI-generated text");
    expect(md).toContain("closer human read");
  });

  it("truncates a long excerpt at a word boundary with an ellipsis", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "writer-test-"));
    const scouted = await seedTextBatch(tempDir);

    const longBody = "word ".repeat(100).trim();
    const result = await runWriter(scouted.batchId, {
      batchesDir: tempDir,
      client: fakeWriterClient({ sections: [{ title: "Long", body: longBody }] }),
    });

    const manifest = JSON.parse(readFileSync(join(result.batchDir, "manifest.json"), "utf-8"));
    expect(manifest.writer.excerpt.length).toBeLessThanOrEqual(281);
    expect(manifest.writer.excerpt.endsWith("…")).toBe(true);
    expect(manifest.writer.excerpt.endsWith(" …")).toBe(false);
  });

  it("refuses to run on a batch that isn't at stage researched", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "writer-test-"));
    const scouted = await seedTextBatch(tempDir);
    await runWriter(scouted.batchId, { batchesDir: tempDir, client: fakeWriterClient() });

    await expect(runWriter(scouted.batchId, { batchesDir: tempDir, client: fakeWriterClient() })).rejects.toThrow(
      /requires stage "researched"/
    );
  });

  it("refuses to run on an illustrated category", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "writer-test-"));
    const scouted = await runScout("Fantasy Castles", { batchesDir: tempDir, claudeClient: fakeClaudeClient() });
    const manifestPath = join(scouted.batchDir, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    manifest.opportunityScanner = {
      category: "Coloring Books",
      contentType: "illustrated",
      illustrationStyle: "coloring-book",
      selectionRationale: "Test fixture.",
      reportJsonPath: "fake.json",
      reportMdPath: "fake.md",
      completedAt: manifest.createdAt,
    };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    await expect(runWriter(scouted.batchId, { batchesDir: tempDir, client: fakeWriterClient() })).rejects.toThrow(
      /only runs on text-only/
    );
  });

  it("refuses to run when the batch has no Opportunity Scanner content type at all", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "writer-test-"));
    const scouted = await runScout("Fantasy Castles", { batchesDir: tempDir, claudeClient: fakeClaudeClient() });

    await expect(runWriter(scouted.batchId, { batchesDir: tempDir, client: fakeWriterClient() })).rejects.toThrow(
      /only runs on text-only/
    );
  });

  it("throws if the batch does not exist", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "writer-test-"));
    await expect(runWriter("no-such-batch", { batchesDir: tempDir, client: fakeWriterClient() })).rejects.toThrow(
      /No batch found/
    );
  });

  it("throws if Claude returns a manuscript with zero sections", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "writer-test-"));
    const scouted = await seedTextBatch(tempDir);

    await expect(
      runWriter(scouted.batchId, { batchesDir: tempDir, client: fakeWriterClient({ sections: [] }) })
    ).rejects.toThrow(/zero sections/);
  });
});
