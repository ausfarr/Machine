import { writeFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
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
 * Re-encodes a source image for embedding as grayscale, palette-quantized
 * PNG at max compression. The interior is black-and-white line art (see
 * kdpSpecs.ts and Loom's style guidance), but Etch's raw Gemini output —
 * and any human-supplied source — is full RGB with generation noise, which
 * bloats a 20-30 page interior PDF well past GitHub's 100MB single-file
 * limit even though each source page looks plain black-on-white. Dropping
 * to grayscale plus a small indexed palette keeps that visual content but
 * lets PNG's compression actually exploit it.
 */
async function recompressForPrint(path: string): Promise<Buffer> {
  return sharp(path)
    .grayscale()
    .png({ compressionLevel: 9, effort: 10, palette: true, colors: 64 })
    .toBuffer();
}

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

    const compressed = await recompressForPrint(image.path);
    const embedded = await pdfDoc.embedPng(compressed);

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
