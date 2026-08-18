import { describe, expect, it } from "vitest";
import { MIN_IMAGE_HEIGHT_PX, MIN_IMAGE_WIDTH_PX, gutterMarginIn, inToPt } from "./kdpSpecs.ts";

describe("inToPt", () => {
  it("converts inches to points at 72pt/in", () => {
    expect(inToPt(1)).toBe(72);
    expect(inToPt(8.5)).toBe(612);
    expect(inToPt(11)).toBe(792);
  });
});

describe("minimum image dimensions", () => {
  it("matches 8.5x11in at 300 DPI", () => {
    expect(MIN_IMAGE_WIDTH_PX).toBe(2550);
    expect(MIN_IMAGE_HEIGHT_PX).toBe(3300);
  });
});

describe("gutterMarginIn", () => {
  it("increases as page count grows", () => {
    expect(gutterMarginIn(24)).toBe(0.375);
    expect(gutterMarginIn(150)).toBe(0.375);
    expect(gutterMarginIn(151)).toBe(0.5);
    expect(gutterMarginIn(300)).toBe(0.5);
    expect(gutterMarginIn(301)).toBe(0.625);
    expect(gutterMarginIn(501)).toBe(0.75);
    expect(gutterMarginIn(701)).toBe(0.875);
  });
});
