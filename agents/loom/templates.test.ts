import { describe, expect, it } from "vitest";
import {
  COMPOSITION_TEMPLATES,
  buildPrompt,
  generateBackMatterDraft,
  generateFrontMatterDraft,
} from "./templates.ts";

describe("buildPrompt", () => {
  it("substitutes the theme into a template", () => {
    expect(buildPrompt("Fantasy Castles", "A view of {theme}.")).toBe("A view of Fantasy Castles.");
  });
});

describe("COMPOSITION_TEMPLATES", () => {
  it("has at least 30 unique templates", () => {
    expect(COMPOSITION_TEMPLATES.length).toBeGreaterThanOrEqual(30);
    expect(new Set(COMPOSITION_TEMPLATES).size).toBe(COMPOSITION_TEMPLATES.length);
  });

  it("every template contains a {theme} placeholder", () => {
    for (const template of COMPOSITION_TEMPLATES) {
      expect(template).toContain("{theme}");
    }
  });
});

describe("front/back matter drafts", () => {
  it("mention the theme", () => {
    expect(generateFrontMatterDraft("Fantasy Castles")).toContain("Fantasy Castles");
    expect(generateBackMatterDraft("Fantasy Castles")).toContain("Fantasy Castles");
  });
});
