import { describe, expect, it } from "vitest";
import { buildTitle } from "../crier/templates.ts";
import { ILLUSTRATION_STYLES, buildPrompt } from "./templates.ts";
import type { IllustrationStyle } from "../../schemas/manifest.ts";

const STYLES: IllustrationStyle[] = ["coloring-book", "picture-book"];

describe("buildPrompt", () => {
  it("substitutes the theme into a template", () => {
    expect(buildPrompt("Fantasy Castles", "A view of {theme}.")).toBe("A view of Fantasy Castles.");
  });
});

describe.each(STYLES)("ILLUSTRATION_STYLES[%s]", (styleName) => {
  const style = ILLUSTRATION_STYLES[styleName];

  it("has at least 30 unique composition templates, each with a {theme} placeholder", () => {
    expect(style.compositionTemplates.length).toBeGreaterThanOrEqual(30);
    expect(new Set(style.compositionTemplates).size).toBe(style.compositionTemplates.length);
    for (const template of style.compositionTemplates) {
      expect(template).toContain("{theme}");
    }
  });

  it("front/back matter drafts mention the theme", () => {
    expect(style.generateFrontMatterDraft("Fantasy Castles")).toContain("Fantasy Castles");
    expect(style.generateBackMatterDraft("Fantasy Castles")).toContain("Fantasy Castles");
  });

  it("buildCoverPrompt mentions the theme and embeds the same title Crier builds for listing.json", () => {
    const prompt = style.buildCoverPrompt("Fantasy Castles");
    expect(prompt.toLowerCase()).toContain("fantasy castles");
    expect(prompt).toContain(buildTitle("Fantasy Castles", styleName));
  });
});

describe("style divergence", () => {
  it("coloring-book and picture-book produce different style guidance and titles", () => {
    const coloringBook = ILLUSTRATION_STYLES["coloring-book"];
    const pictureBook = ILLUSTRATION_STYLES["picture-book"];

    expect(coloringBook.styleGuidance).not.toBe(pictureBook.styleGuidance);
    expect(coloringBook.coverStyleGuidance).not.toBe(pictureBook.coverStyleGuidance);
    expect(coloringBook.buildCoverPrompt("Fantasy Castles")).not.toBe(pictureBook.buildCoverPrompt("Fantasy Castles"));
    expect(buildTitle("Fantasy Castles", "coloring-book")).not.toBe(buildTitle("Fantasy Castles", "picture-book"));
  });
});
