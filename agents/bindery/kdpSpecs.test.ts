import { describe, expect, it } from "vitest";
import {
  COVER_BLEED_IN,
  MIN_IMAGE_HEIGHT_PX,
  MIN_IMAGE_WIDTH_PX,
  MIN_PAGES_FOR_SPINE_TEXT,
  TRIM_HEIGHT_IN,
  TRIM_WIDTH_IN,
  coverWrapDimensionsIn,
  gutterMarginIn,
  inToPt,
  spineWidthIn,
} from "./kdpSpecs.ts";

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

describe("spineWidthIn", () => {
  it("grows linearly with page count", () => {
    expect(spineWidthIn(0)).toBe(0);
    expect(spineWidthIn(100)).toBeCloseTo(0.2252, 4);
    expect(spineWidthIn(200)).toBeCloseTo(spineWidthIn(100) * 2, 4);
  });
});

describe("coverWrapDimensionsIn", () => {
  it("lays out back panel, spine, and front panel left to right with bleed on the outer edges only", () => {
    const dims = coverWrapDimensionsIn(24);
    const spine = spineWidthIn(24);

    expect(dims.spineWidthIn).toBeCloseTo(spine, 6);
    expect(dims.backPanelXIn).toBe(0);
    expect(dims.spineXIn).toBeCloseTo(TRIM_WIDTH_IN + COVER_BLEED_IN, 6);
    expect(dims.frontPanelXIn).toBeCloseTo(TRIM_WIDTH_IN + COVER_BLEED_IN + spine, 6);
    expect(dims.wrapWidthIn).toBeCloseTo(TRIM_WIDTH_IN * 2 + spine + COVER_BLEED_IN * 2, 6);
    expect(dims.wrapHeightIn).toBeCloseTo(TRIM_HEIGHT_IN + COVER_BLEED_IN * 2, 6);
  });

  it("widens as page count (and therefore spine width) grows", () => {
    expect(coverWrapDimensionsIn(500).wrapWidthIn).toBeGreaterThan(coverWrapDimensionsIn(24).wrapWidthIn);
  });
});

describe("MIN_PAGES_FOR_SPINE_TEXT", () => {
  it("is a positive threshold", () => {
    expect(MIN_PAGES_FOR_SPINE_TEXT).toBeGreaterThan(0);
  });
});
