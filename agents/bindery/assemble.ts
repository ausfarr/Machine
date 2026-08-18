import { readFileSync, writeFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import {
  BOTTOM_MARGIN_IN,
  OUTER_MARGIN_IN,
  TOP_MARGIN_IN,
  TRIM_HEIGHT_PT,
  TRIM_WIDTH_PT,
  gutterMarginIn,
  inToPt,
} from "./kdpSpecs.ts";
import type { ValidatedImage } from "./validateImages.ts";

/**
 * Lays out one image per page on an 8.5x11in trim, no bleed. Odd page
 * numbers are treated as recto (right-hand) pages with the gutter margin
 * on the left; even pages are verso (left-hand) with the gutter on the
 * right, so the inside margin always faces the spine.
 */
export async function assembleInteriorPdf(images: ValidatedImage[], outputPath: string): Promise<number> {
  const pageCount = images.length;
  const gutterPt = inToPt(gutterMarginIn(pageCount));
  const outerPt = inToPt(OUTER_MARGIN_IN);
  const topPt = inToPt(TOP_MARGIN_IN);
  const bottomPt = inToPt(BOTTOM_MARGIN_IN);

  const pdfDoc = await PDFDocument.create();

  for (const image of images) {
    const isRecto = image.index % 2 === 1;
    const leftMarginPt = isRecto ? gutterPt : outerPt;
    const rightMarginPt = isRecto ? outerPt : gutterPt;

    const contentWidthPt = TRIM_WIDTH_PT - leftMarginPt - rightMarginPt;
    const contentHeightPt = TRIM_HEIGHT_PT - topPt - bottomPt;

    const bytes = readFileSync(image.path);
    const embedded = image.format === "png" ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);

    const scale = Math.min(contentWidthPt / embedded.width, contentHeightPt / embedded.height);
    const drawWidth = embedded.width * scale;
    const drawHeight = embedded.height * scale;

    const page = pdfDoc.addPage([TRIM_WIDTH_PT, TRIM_HEIGHT_PT]);
    const x = leftMarginPt + (contentWidthPt - drawWidth) / 2;
    const y = bottomPt + (contentHeightPt - drawHeight) / 2;
    page.drawImage(embedded, { x, y, width: drawWidth, height: drawHeight });
  }

  const pdfBytes = await pdfDoc.save();
  writeFileSync(outputPath, pdfBytes);
  return pageCount;
}
