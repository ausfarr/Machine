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
});
