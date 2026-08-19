import { PDFDocument, PDFFont, StandardFonts, degrees, rgb } from "pdf-lib";
import sharp from "sharp";
import { writeFileSync } from "node:fs";
import { AUTHOR_NAME } from "../../config.ts";
import { buildSubtitle, buildTitle } from "../crier/templates.ts";
import {
  COVER_BLEED_IN,
  MIN_PAGES_FOR_SPINE_TEXT,
  REQUIRED_DPI,
  TRIM_WIDTH_IN,
  coverWrapDimensionsIn,
  inToPt,
} from "./kdpSpecs.ts";

/** Margin kept clear of text, inset from each panel's trim edge (not counting bleed). */
const TEXT_MARGIN_IN = 0.4;

/**
 * KDP auto-places the ISBN barcode in the bottom-right corner of the back
 * panel — this much space (from the panel's bottom-right trim corner) is
 * kept free of text so a human doesn't have to redo layout after KDP drops
 * the barcode in. Reconfirm the exact zone against KDP's current cover
 * template before publishing.
 */
const BARCODE_SAFE_WIDTH_IN = 2.0;
const BARCODE_SAFE_HEIGHT_IN = 1.2;

const FRONT_PANEL_WIDTH_IN = TRIM_WIDTH_IN + COVER_BLEED_IN;
const BACK_PANEL_WIDTH_IN = TRIM_WIDTH_IN + COVER_BLEED_IN;

/** Greedy word-wrap using the font's real glyph widths, since pdf-lib doesn't wrap text itself. */
function wrapText(text: string, font: PDFFont, size: number, maxWidthPt: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidthPt) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Assembles a full KDP wrap cover PDF — back panel, spine, and front panel
 * in one bleed-inclusive page — from a single front-cover art image plus
 * text already produced earlier in the pipeline (Loom's back-cover blurb
 * draft, Crier's title/subtitle logic, config.ts's AUTHOR_NAME). Title and
 * author text are drawn programmatically rather than relying on the AI art
 * to render legible words, so the cover is legible regardless of what the
 * image model drew.
 */
export async function assembleCoverPdf(
  coverArtPath: string,
  backCoverBlurb: string,
  theme: string,
  pageCount: number,
  outputPath: string
): Promise<void> {
  const dims = coverWrapDimensionsIn(pageCount);
  const wrapWidthPt = inToPt(dims.wrapWidthIn);
  const wrapHeightPt = inToPt(dims.wrapHeightIn);

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([wrapWidthPt, wrapHeightPt]);

  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Base background, visible behind the back panel's and spine's fills.
  page.drawRectangle({ x: 0, y: 0, width: wrapWidthPt, height: wrapHeightPt, color: rgb(0.96, 0.95, 0.9) });

  // --- Spine ---
  const spineXPt = inToPt(dims.spineXIn);
  const spineWidthPt = inToPt(dims.spineWidthIn);
  page.drawRectangle({ x: spineXPt, y: 0, width: spineWidthPt, height: wrapHeightPt, color: rgb(0.18, 0.18, 0.24) });

  if (pageCount >= MIN_PAGES_FOR_SPINE_TEXT) {
    const spineTitle = buildTitle(theme);
    const spineFontSize = 14;
    const textWidthPt = boldFont.widthOfTextAtSize(spineTitle, spineFontSize);
    const spineCenterXPt = spineXPt + spineWidthPt / 2;
    page.drawText(spineTitle, {
      x: spineCenterXPt + spineFontSize / 2.5,
      y: (wrapHeightPt - textWidthPt) / 2,
      size: spineFontSize,
      font: boldFont,
      color: rgb(1, 1, 1),
      rotate: degrees(90),
    });
  }

  // --- Front panel: cover art, resized/cropped to fill the panel exactly ---
  const frontPanelXPt = inToPt(dims.frontPanelXIn);
  const frontPanelWidthPt = inToPt(FRONT_PANEL_WIDTH_IN);
  const frontPanelWidthPx = Math.round(FRONT_PANEL_WIDTH_IN * REQUIRED_DPI);
  const frontPanelHeightPx = Math.round(dims.wrapHeightIn * REQUIRED_DPI);

  const frontArtBuffer = await sharp(coverArtPath)
    .resize(frontPanelWidthPx, frontPanelHeightPx, { fit: "cover" })
    .png()
    .toBuffer();
  const frontArtImage = await pdfDoc.embedPng(frontArtBuffer);
  page.drawImage(frontArtImage, { x: frontPanelXPt, y: 0, width: frontPanelWidthPt, height: wrapHeightPt });

  // Title/subtitle/author band, drawn on top of the art so it's always legible.
  const title = buildTitle(theme);
  const subtitle = buildSubtitle(theme, pageCount);
  const bandHeightIn = 2.2;
  const bandYPt = wrapHeightPt - inToPt(COVER_BLEED_IN + bandHeightIn);
  page.drawRectangle({
    x: frontPanelXPt,
    y: bandYPt,
    width: frontPanelWidthPt,
    height: inToPt(bandHeightIn),
    color: rgb(0, 0, 0),
    opacity: 0.4,
  });

  const frontTextXPt = frontPanelXPt + inToPt(TEXT_MARGIN_IN);
  const frontTextMaxWidthPt = frontPanelWidthPt - inToPt(TEXT_MARGIN_IN * 2);

  const titleSize = 28;
  const titleLines = wrapText(title, boldFont, titleSize, frontTextMaxWidthPt);
  let cursorYPt = bandYPt + inToPt(bandHeightIn) - inToPt(TEXT_MARGIN_IN) - titleSize;
  for (const line of titleLines) {
    page.drawText(line, { x: frontTextXPt, y: cursorYPt, size: titleSize, font: boldFont, color: rgb(1, 1, 1) });
    cursorYPt -= titleSize * 1.15;
  }

  const subtitleSize = 14;
  const subtitleLines = wrapText(subtitle, regularFont, subtitleSize, frontTextMaxWidthPt);
  cursorYPt -= subtitleSize * 0.5;
  for (const line of subtitleLines) {
    page.drawText(line, {
      x: frontTextXPt,
      y: cursorYPt,
      size: subtitleSize,
      font: regularFont,
      color: rgb(1, 1, 1),
    });
    cursorYPt -= subtitleSize * 1.15;
  }

  page.drawText(AUTHOR_NAME, {
    x: frontTextXPt,
    y: bandYPt + inToPt(TEXT_MARGIN_IN),
    size: 12,
    font: regularFont,
    color: rgb(1, 1, 1),
  });

  // --- Back panel: blurb text, avoiding KDP's barcode-safe zone bottom-right ---
  const backTextXPt = inToPt(COVER_BLEED_IN + TEXT_MARGIN_IN);
  const backTextMaxWidthPt = inToPt(TRIM_WIDTH_IN - TEXT_MARGIN_IN * 2);
  const blurbSize = 12;
  const blurbLines = wrapText(backCoverBlurb, regularFont, blurbSize, backTextMaxWidthPt);

  const barcodeSafeTopPt = inToPt(BARCODE_SAFE_HEIGHT_IN);
  let backCursorYPt = wrapHeightPt - inToPt(COVER_BLEED_IN + TEXT_MARGIN_IN) - blurbSize;
  for (const line of blurbLines) {
    if (backCursorYPt < barcodeSafeTopPt) break; // stop before entering the barcode-safe zone
    page.drawText(line, {
      x: backTextXPt,
      y: backCursorYPt,
      size: blurbSize,
      font: regularFont,
      color: rgb(0.15, 0.15, 0.15),
    });
    backCursorYPt -= blurbSize * 1.3;
  }

  const pdfBytes = await pdfDoc.save();
  writeFileSync(outputPath, pdfBytes);
}
