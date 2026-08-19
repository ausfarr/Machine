/**
 * KDP print specs for the default 8.5x11in black-and-white, no-bleed
 * coloring book interior. Gutter margin minimums follow Amazon KDP's
 * published print guidelines for black-and-white interiors on white
 * paper — reconfirm against KDP's current spec sheet before publishing,
 * since Amazon can revise these.
 */

export const POINTS_PER_INCH = 72;

export const TRIM_WIDTH_IN = 8.5;
export const TRIM_HEIGHT_IN = 11;
export const TRIM_SIZE_LABEL = "8.5x11in";

export const REQUIRED_DPI = 300;

export const OUTER_MARGIN_IN = 0.5;
export const TOP_MARGIN_IN = 0.5;
export const BOTTOM_MARGIN_IN = 0.5;

export function inToPt(inches: number): number {
  return inches * POINTS_PER_INCH;
}

export const TRIM_WIDTH_PT = inToPt(TRIM_WIDTH_IN);
export const TRIM_HEIGHT_PT = inToPt(TRIM_HEIGHT_IN);

export const MIN_IMAGE_WIDTH_PX = Math.round(TRIM_WIDTH_IN * REQUIRED_DPI);
export const MIN_IMAGE_HEIGHT_PX = Math.round(TRIM_HEIGHT_IN * REQUIRED_DPI);

/** Minimum inside (gutter) margin in inches, by interior page count. */
export function gutterMarginIn(pageCount: number): number {
  if (pageCount <= 150) return 0.375;
  if (pageCount <= 300) return 0.5;
  if (pageCount <= 500) return 0.625;
  if (pageCount <= 700) return 0.75;
  return 0.875;
}

/**
 * KDP full-wrap paperback cover specs — front + spine + back in one bleed
 * PDF. Spine width and bleed follow Amazon KDP's published cover-template
 * formula for a black-and-white interior printed on white paper —
 * reconfirm against KDP's current spec sheet before publishing, since
 * Amazon can revise these.
 */

/** Bleed added to every outer edge of the full wrap cover (not the interior, which has none). */
export const COVER_BLEED_IN = 0.125;

/** KDP's published spine-width factor (inches per page) for a black-and-white interior on white paper. */
export const WHITE_PAPER_SPINE_IN_PER_PAGE = 0.002252;

/** Below this interior page count, KDP's own guidance says spine text won't be legible — the spine is left blank instead. */
export const MIN_PAGES_FOR_SPINE_TEXT = 130;

export function spineWidthIn(pageCount: number): number {
  return pageCount * WHITE_PAPER_SPINE_IN_PER_PAGE;
}

export interface CoverWrapDimensions {
  wrapWidthIn: number;
  wrapHeightIn: number;
  spineWidthIn: number;
  /** X-offset (from the wrap's left edge, bleed included) where each panel starts, in inches. */
  backPanelXIn: number;
  spineXIn: number;
  frontPanelXIn: number;
}

/**
 * Full wrap layout, left to right: back panel, spine, front panel — each
 * TRIM_WIDTH_IN wide (TRIM_WIDTH_IN + 2*bleed for the outer back/front
 * panels), with bleed added top/bottom and on the two outer edges only
 * (the spine's own edges are internal, not bled).
 */
export function coverWrapDimensionsIn(pageCount: number): CoverWrapDimensions {
  const spine = spineWidthIn(pageCount);
  const wrapWidthIn = TRIM_WIDTH_IN * 2 + spine + COVER_BLEED_IN * 2;
  const wrapHeightIn = TRIM_HEIGHT_IN + COVER_BLEED_IN * 2;

  const backPanelXIn = 0;
  const spineXIn = TRIM_WIDTH_IN + COVER_BLEED_IN;
  const frontPanelXIn = spineXIn + spine;

  return { wrapWidthIn, wrapHeightIn, spineWidthIn: spine, backPanelXIn, spineXIn, frontPanelXIn };
}
