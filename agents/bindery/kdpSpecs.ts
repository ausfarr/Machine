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
