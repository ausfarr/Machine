import { writeFileSync } from "node:fs";
import { PDFDocument, PDFPage, StandardFonts } from "pdf-lib";
import {
  BOTTOM_MARGIN_IN,
  OUTER_MARGIN_IN,
  TOP_MARGIN_IN,
  TRIM_HEIGHT_PT,
  TRIM_WIDTH_PT,
  gutterMarginIn,
  inToPt,
} from "./kdpSpecs.ts";

/**
 * Manuscript-typesetting assembly mode, for Writer-sourced text-only
 * batches — the sibling of assemble.ts's image-grid mode (see CLAUDE.md's
 * Bindery section). Lays out real running text with word-wrapping,
 * chapter breaks, running heads, and widow/orphan control, rather than
 * placing one image per page.
 *
 * Gutter margin: gutterMarginIn() scales with final page count (see
 * kdpSpecs.ts), but a manuscript's page count is only known *after*
 * flowing the text — a chicken-and-egg problem the image-grid mode never
 * has, since its page count equals the prompt count up front. Rather than
 * flow twice, this uses the largest (safest) gutter tier unconditionally.
 * That never violates KDP's minimum for any page count; it can only ever
 * reserve a little more inner margin than a shorter manuscript strictly
 * needs.
 */
const SAFE_GUTTER_IN = gutterMarginIn(701);

const BODY_FONT_SIZE = 11;
const LINE_HEIGHT_PT = BODY_FONT_SIZE * 1.4;
const CHAPTER_TITLE_FONT_SIZE = 20;
const CHAPTER_TITLE_TOP_GAP_PT = 54;
const CHAPTER_TITLE_BOTTOM_GAP_PT = 24;
const RUNNING_HEAD_FONT_SIZE = 9;
const RUNNING_HEAD_RESERVED_PT = 30;
const FOLIO_FONT_SIZE = 9;
const FOLIO_RESERVED_PT = 24;

export interface ManuscriptChapter {
  /** Empty string for a chapter with no visible heading (used sparingly — every chapter here has a real title). */
  title: string;
  body: string;
}

export interface WrappedParagraph {
  lines: string[];
}

/** Decouples wrapping/pagination from pdf-lib's PDFFont so both are unit-testable without embedding a real font. */
export type MeasureWidthFn = (text: string, fontSize: number) => number;

/** Greedy word-wrap: never breaks a single word, so a word wider than maxWidthPt is left to overflow its line rather than silently dropped. */
export function wrapParagraph(text: string, measureWidth: MeasureWidthFn, fontSize: number, maxWidthPt: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let current = words[0]!;
  for (const word of words.slice(1)) {
    const candidate = `${current} ${word}`;
    if (measureWidth(candidate, fontSize) <= maxWidthPt) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
}

export function wrapChapterBody(body: string, measureWidth: MeasureWidthFn, maxWidthPt: number): WrappedParagraph[] {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => ({ lines: wrapParagraph(p, measureWidth, BODY_FONT_SIZE, maxWidthPt) }))
    .filter((p) => p.lines.length > 0);
}

/**
 * Builds a per-page assignment of lines up front (pure computation, no PDF
 * calls), applying widow/orphan control: a paragraph's first line is never
 * left alone at the bottom of a page (orphan), and its last line is never
 * left alone at the top of the next page (widow) — in both cases, at
 * least 2 lines move together instead of 1.
 */
export function paginateChapter(paragraphs: WrappedParagraph[], maxLinesPerPage: number): string[][] {
  const pages: string[][] = [[]];
  let linesOnPage = 0;

  const startNewPage = () => {
    pages.push([]);
    linesOnPage = 0;
  };

  for (const { lines } of paragraphs) {
    let remainingLines = lines;

    while (remainingLines.length > 0) {
      const spaceLeft = maxLinesPerPage - linesOnPage;

      if (spaceLeft <= 0) {
        startNewPage();
        continue;
      }

      if (remainingLines.length <= spaceLeft) {
        // The rest of this paragraph fits entirely on the current page.
        pages[pages.length - 1]!.push(...remainingLines);
        linesOnPage += remainingLines.length;
        remainingLines = [];
        continue;
      }

      // The paragraph must split across pages. Decide how many lines stay
      // on this page, respecting orphan (don't strand a lone first line
      // here) and widow (don't strand a lone last line on the next page).
      let placeHere = spaceLeft;
      if (placeHere === 1 && remainingLines.length > 1) {
        placeHere = 0; // orphan: push the paragraph's start to the next page instead
      } else if (remainingLines.length - placeHere === 1) {
        placeHere = Math.max(0, placeHere - 1); // widow: carry 2 lines over together, not 1
      }

      if (placeHere > 0) {
        pages[pages.length - 1]!.push(...remainingLines.slice(0, placeHere));
        linesOnPage += placeHere;
        remainingLines = remainingLines.slice(placeHere);
      }
      startNewPage();
    }

    // A blank line's worth of paragraph spacing, if there's room; otherwise the next paragraph just starts a fresh page.
    if (linesOnPage < maxLinesPerPage) {
      linesOnPage += 1;
    } else {
      startNewPage();
    }
  }

  // The paragraph-gap step above can push a trailing empty page after the
  // very last paragraph (when it exactly filled the previous page) — strip
  // it so a chapter never ends with a page that's just a running head and
  // a folio over blank space.
  while (pages.length > 1 && pages[pages.length - 1]!.length === 0) {
    pages.pop();
  }

  return pages;
}

export interface TypesetResult {
  pageCount: number;
}

/**
 * Typesets a full manuscript — front matter, one chapter per section, back
 * matter — into a print-ready interior PDF. Each chapter starts on a fresh
 * page (its title serving as that page's own heading, so no running head
 * is drawn there); continuation pages carry the book title as a running
 * head plus a centered folio (page number).
 */
export async function assembleManuscriptPdf(chapters: ManuscriptChapter[], bookTitle: string, outputPath: string): Promise<TypesetResult> {
  const gutterPt = inToPt(SAFE_GUTTER_IN);
  const outerPt = inToPt(OUTER_MARGIN_IN);
  const topPt = inToPt(TOP_MARGIN_IN);
  const bottomPt = inToPt(BOTTOM_MARGIN_IN);

  const pdfDoc = await PDFDocument.create();
  const bodyFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const titleFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const headFont = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);

  let pageIndex = 0; // 1-based once incremented; used for recto/verso + folio numbering

  function addPage(): { page: PDFPage; leftPt: number; rightPt: number } {
    pageIndex += 1;
    const isRecto = pageIndex % 2 === 1;
    const leftPt = isRecto ? gutterPt : outerPt;
    const rightPt = isRecto ? outerPt : gutterPt;
    const page = pdfDoc.addPage([TRIM_WIDTH_PT, TRIM_HEIGHT_PT]);
    return { page, leftPt, rightPt };
  }

  function drawRunningHeadAndFolio(page: PDFPage, leftPt: number, rightPt: number, withRunningHead: boolean) {
    const contentWidthPt = TRIM_WIDTH_PT - leftPt - rightPt;
    if (withRunningHead) {
      const headWidth = headFont.widthOfTextAtSize(bookTitle, RUNNING_HEAD_FONT_SIZE);
      page.drawText(bookTitle, {
        x: leftPt + (contentWidthPt - headWidth) / 2,
        y: TRIM_HEIGHT_PT - topPt + 8,
        size: RUNNING_HEAD_FONT_SIZE,
        font: headFont,
      });
    }
    const folioText = String(pageIndex);
    const folioWidth = bodyFont.widthOfTextAtSize(folioText, FOLIO_FONT_SIZE);
    page.drawText(folioText, {
      x: leftPt + (contentWidthPt - folioWidth) / 2,
      y: bottomPt - 16,
      size: FOLIO_FONT_SIZE,
      font: bodyFont,
    });
  }

  for (const chapter of chapters) {
    const { page: firstPage, leftPt, rightPt } = addPage();
    const contentWidthPt = TRIM_WIDTH_PT - leftPt - rightPt;

    let y = TRIM_HEIGHT_PT - topPt;

    if (chapter.title) {
      y -= CHAPTER_TITLE_TOP_GAP_PT;
      const titleWidth = titleFont.widthOfTextAtSize(chapter.title, CHAPTER_TITLE_FONT_SIZE);
      firstPage.drawText(chapter.title, {
        x: leftPt + Math.max(0, (contentWidthPt - titleWidth) / 2),
        y,
        size: CHAPTER_TITLE_FONT_SIZE,
        font: titleFont,
      });
      y -= CHAPTER_TITLE_BOTTOM_GAP_PT;
    }

    // No running head on a chapter's opening page — its title is the heading.
    drawRunningHeadAndFolio(firstPage, leftPt, rightPt, false);

    const bodyTopPt = y;
    const bodyBottomPt = bottomPt + FOLIO_RESERVED_PT;
    const availableHeightPt = bodyTopPt - bodyBottomPt;
    const maxLinesFirstPage = Math.max(1, Math.floor(availableHeightPt / LINE_HEIGHT_PT));

    const continuationTopPt = TRIM_HEIGHT_PT - topPt - RUNNING_HEAD_RESERVED_PT;
    const continuationAvailableHeightPt = continuationTopPt - bodyBottomPt;
    const maxLinesContinuationPage = Math.max(1, Math.floor(continuationAvailableHeightPt / LINE_HEIGHT_PT));

    const paragraphs = wrapChapterBody(chapter.body, (text, size) => bodyFont.widthOfTextAtSize(text, size), contentWidthPt);

    // paginateChapter assumes a uniform max-lines-per-page; the first page
    // of a chapter has less room than a continuation page (title eats into
    // it), so pass the smaller of the two — a continuation page then just
    // has a little extra breathing room at the bottom, never an overflow.
    const pages = paginateChapter(paragraphs, Math.min(maxLinesFirstPage, maxLinesContinuationPage));

    let currentPage = firstPage;
    let currentLeftPt = leftPt;
    let currentTopPt = bodyTopPt;

    pages.forEach((lines, i) => {
      if (i > 0) {
        const next = addPage();
        currentPage = next.page;
        currentLeftPt = next.leftPt;
        currentTopPt = TRIM_HEIGHT_PT - topPt - RUNNING_HEAD_RESERVED_PT;
        drawRunningHeadAndFolio(currentPage, next.leftPt, next.rightPt, true);
      }

      let lineY = currentTopPt;
      for (const line of lines) {
        currentPage.drawText(line, { x: currentLeftPt, y: lineY, size: BODY_FONT_SIZE, font: bodyFont });
        lineY -= LINE_HEIGHT_PT;
      }
    });
  }

  const pdfBytes = await pdfDoc.save();
  writeFileSync(outputPath, pdfBytes);
  return { pageCount: pageIndex };
}
