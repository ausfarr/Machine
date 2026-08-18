import { describe, expect, it } from "vitest";
import { assessCompetition, generateKeywordVariants, suggestAngle } from "./heuristics.ts";

describe("assessCompetition", () => {
  it("flags a generic saturated theme as high competition", () => {
    const result = assessCompetition("Mandala");
    expect(result.level).toBe("high");
    expect(result.signals.matchesKnownSaturatedNiche).toBe(true);
  });

  it("does not flag high competition when a saturated term has a differentiating modifier", () => {
    const result = assessCompetition("Gothic Mandala");
    expect(result.level).toBe("low");
    expect(result.signals.hasSpecificityModifier).toBe(true);
  });

  it("treats an unmatched multi-word theme as low competition", () => {
    const result = assessCompetition("Retired lighthouse keepers napping");
    expect(result.level).toBe("low");
  });

  it("treats a short unmatched theme as medium competition", () => {
    const result = assessCompetition("Sprockets");
    expect(result.level).toBe("medium");
  });
});

describe("suggestAngle", () => {
  it("is deterministic for the same theme", () => {
    expect(suggestAngle("Fantasy Castles")).toBe(suggestAngle("Fantasy Castles"));
  });

  it("includes the theme text in the suggestion", () => {
    expect(suggestAngle("Fantasy Castles")).toContain("Fantasy Castles");
  });
});

describe("generateKeywordVariants", () => {
  it("produces deduplicated, trimmed variants", () => {
    const variants = generateKeywordVariants("Fantasy Castles");
    expect(variants).toContain("Fantasy Castles coloring book");
    expect(new Set(variants).size).toBe(variants.length);
  });
});
