import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateManifest } from "./manifest.ts";

const examplePath = fileURLToPath(
  new URL("./examples/manifest.example.json", import.meta.url)
);

describe("validateManifest", () => {
  it("accepts the example fixture", () => {
    const data = JSON.parse(readFileSync(examplePath, "utf-8"));
    const manifest = validateManifest(data);
    expect(manifest.stage).toBe("prompted");
    expect(manifest.loom?.promptCount).toBe(24);
  });

  it("rejects a manifest with an unknown stage", () => {
    const data = JSON.parse(readFileSync(examplePath, "utf-8"));
    data.stage = "not-a-real-stage";
    expect(() => validateManifest(data)).toThrow();
  });

  it("rejects a manifest that claims a stage without the required prior work", () => {
    const data = JSON.parse(readFileSync(examplePath, "utf-8"));
    data.stage = "assembled";
    // images and bindery are missing, so this should fail even though the
    // JSON is otherwise well-formed — catches fabricated/skipped progress.
    expect(() => validateManifest(data)).toThrow(/missing required field/);
  });

  it("rejects a manifest missing a required field", () => {
    const data = JSON.parse(readFileSync(examplePath, "utf-8"));
    delete data.theme;
    expect(() => validateManifest(data)).toThrow();
  });

  it("accepts a text-only manifest at stage manuscripted", () => {
    const data = JSON.parse(readFileSync(examplePath, "utf-8"));
    data.stage = "manuscripted";
    data.opportunityScanner = {
      category: "Poetry Collections",
      contentType: "text",
      selectionRationale: "Test fixture.",
      reportJsonPath: "fake.json",
      reportMdPath: "fake.md",
      completedAt: data.createdAt,
    };
    data.writer = {
      manuscriptMdPath: "manuscript.md",
      manuscriptJsonPath: "manuscript.json",
      sectionCount: 15,
      wordCount: 4000,
      excerpt: "A fake excerpt.",
      aiGeneratedDisclosure: true,
      proofreadRecommended: true,
      completedAt: data.createdAt,
    };
    delete data.loom;
    const manifest = validateManifest(data);
    expect(manifest.stage).toBe("manuscripted");
  });

  it("rejects a text-only manifest at stage assembled without writer+bindery, even though loom/images are absent by design", () => {
    const data = JSON.parse(readFileSync(examplePath, "utf-8"));
    data.stage = "assembled";
    data.opportunityScanner = {
      category: "Poetry Collections",
      contentType: "text",
      selectionRationale: "Test fixture.",
      reportJsonPath: "fake.json",
      reportMdPath: "fake.md",
      completedAt: data.createdAt,
    };
    delete data.loom;
    delete data.images;
    expect(() => validateManifest(data)).toThrow(/missing required field.*writer/);
  });

  it("accepts a text-only manifest at stage assembled once writer+bindery are present, without requiring loom/images", () => {
    const data = JSON.parse(readFileSync(examplePath, "utf-8"));
    data.stage = "assembled";
    data.opportunityScanner = {
      category: "Poetry Collections",
      contentType: "text",
      selectionRationale: "Test fixture.",
      reportJsonPath: "fake.json",
      reportMdPath: "fake.md",
      completedAt: data.createdAt,
    };
    data.writer = {
      manuscriptMdPath: "manuscript.md",
      manuscriptJsonPath: "manuscript.json",
      sectionCount: 15,
      wordCount: 4000,
      excerpt: "A fake excerpt.",
      aiGeneratedDisclosure: true,
      proofreadRecommended: true,
      completedAt: data.createdAt,
    };
    data.bindery = {
      interiorPdfPath: "batches/example-fantasy-castles/interior.pdf",
      trimSize: "8.5x11in",
      pageCount: 40,
      completedAt: data.createdAt,
    };
    delete data.loom;
    delete data.images;
    const manifest = validateManifest(data);
    expect(manifest.stage).toBe("assembled");
  });
});
