import { describe, expect, it } from "vitest";
import { MAX_KEYWORD_LENGTH, buildKeywords, buildSubtitle, buildTitle, truncate } from "./templates.ts";

describe("truncate", () => {
  it("leaves short strings unchanged", () => {
    expect(truncate("short", 50)).toBe("short");
  });

  it("cuts long strings to the limit", () => {
    const long = "a".repeat(60);
    expect(truncate(long, 50)).toHaveLength(50);
  });

  it("cuts at a word boundary instead of mid-word", () => {
    const original = "Enchanted Lighthouse Keepers coloring book for kids";
    const result = truncate(original, 45);
    expect(result.length).toBeLessThanOrEqual(45);
    // the character right after the cut in the original string must be a
    // word boundary (space or end of string), never a mid-word cut
    const nextChar = original[result.length];
    expect(nextChar === undefined || nextChar === " ").toBe(true);
  });
});

describe("buildKeywords", () => {
  it("returns exactly 7 unique keywords, each within the KDP length limit", () => {
    const keywords = buildKeywords("Fantasy Castles");
    expect(keywords).toHaveLength(7);
    expect(new Set(keywords).size).toBe(7);
    for (const k of keywords) {
      expect(k.length).toBeLessThanOrEqual(MAX_KEYWORD_LENGTH);
    }
  });
});

describe("buildTitle / buildSubtitle", () => {
  it("include the theme and page count", () => {
    expect(buildTitle("Fantasy Castles")).toContain("Fantasy Castles");
    const subtitle = buildSubtitle("Fantasy Castles", 24);
    expect(subtitle).toContain("Fantasy Castles");
    expect(subtitle).toContain("24");
  });

  it("default to coloring-book style when no illustrationStyle is given", () => {
    expect(buildTitle("Fantasy Castles")).toBe(buildTitle("Fantasy Castles", "coloring-book"));
    expect(buildSubtitle("Fantasy Castles", 24)).toBe(buildSubtitle("Fantasy Castles", 24, "coloring-book"));
  });

  it("produce different, theme-including text for picture-book style", () => {
    const title = buildTitle("Fantasy Castles", "picture-book");
    expect(title).toContain("Fantasy Castles");
    expect(title).not.toBe(buildTitle("Fantasy Castles", "coloring-book"));

    const subtitle = buildSubtitle("Fantasy Castles", 24, "picture-book");
    expect(subtitle).toContain("Fantasy Castles");
    expect(subtitle).toContain("24");
    expect(subtitle).not.toBe(buildSubtitle("Fantasy Castles", 24, "coloring-book"));
  });
});
