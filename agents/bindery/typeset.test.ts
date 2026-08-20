import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { afterEach, describe, expect, it } from "vitest";
import { assembleManuscriptPdf, paginateChapter, wrapChapterBody, wrapParagraph, type WrappedParagraph } from "./typeset.ts";

/** A fixed-width-per-character stand-in for a real font, so tests don't depend on Times-Roman's actual glyph metrics. */
const CHAR_WIDTH = 6;
const measureWidth = (text: string, fontSize: number) => text.length * CHAR_WIDTH * (fontSize / 10);

describe("wrapParagraph", () => {
  it("keeps a short paragraph on one line", () => {
    expect(wrapParagraph("A short line.", measureWidth, 10, 1000)).toEqual(["A short line."]);
  });

  it("wraps at word boundaries once a line would exceed the max width", () => {
    // Each word is "word" (4 chars) + a space; width at size 10 is 4*6=24pt/word.
    // maxWidthPt=70 fits 2 words (48pt) but not 3 (72pt).
    const lines = wrapParagraph("word word word word", measureWidth, 10, 70);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(measureWidth(line, 10)).toBeLessThanOrEqual(70);
    }
    expect(lines.join(" ")).toBe("word word word word");
  });

  it("never breaks a single word even if it's wider than maxWidthPt", () => {
    const lines = wrapParagraph("supercalifragilisticexpialidocious", measureWidth, 10, 10);
    expect(lines).toEqual(["supercalifragilisticexpialidocious"]);
  });

  it("returns an empty array for empty/whitespace-only text", () => {
    expect(wrapParagraph("", measureWidth, 10, 1000)).toEqual([]);
    expect(wrapParagraph("   ", measureWidth, 10, 1000)).toEqual([]);
  });
});

describe("wrapChapterBody", () => {
  it("splits on blank lines into separate paragraphs", () => {
    const paragraphs = wrapChapterBody("First paragraph.\n\nSecond paragraph.", measureWidth, 1000);
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]!.lines).toEqual(["First paragraph."]);
    expect(paragraphs[1]!.lines).toEqual(["Second paragraph."]);
  });

  it("drops empty paragraphs from extra blank lines", () => {
    const paragraphs = wrapChapterBody("First.\n\n\n\nSecond.", measureWidth, 1000);
    expect(paragraphs).toHaveLength(2);
  });
});

function para(...lines: string[]): WrappedParagraph {
  return { lines };
}

describe("paginateChapter", () => {
  it("places everything on one page when it all fits", () => {
    const pages = paginateChapter([para("a", "b"), para("c")], 10);
    expect(pages).toEqual([["a", "b", "c"]]);
  });

  it("starts a new page when the current one is full", () => {
    const pages = paginateChapter([para("a", "b"), para("c", "d")], 2);
    expect(pages.length).toBeGreaterThanOrEqual(2);
    expect(pages.flat()).toEqual(["a", "b", "c", "d"]);
  });

  it("never leaves a single orphaned first line of a paragraph alone at the bottom of a page", () => {
    // Page holds 4 lines. First paragraph is 2 lines; the paragraph-gap
    // step brings the page to 3/4 lines used, leaving exactly 1 line of
    // room — not enough for a 3-line second paragraph's first line
    // without orphaning it there.
    const pages = paginateChapter([para("p1-a", "p1-b"), para("p2-a", "p2-b", "p2-c")], 4);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toEqual(["p1-a", "p1-b"]);
    expect(pages[1]).toEqual(["p2-a", "p2-b", "p2-c"]);
  });

  it("never leaves a single widowed last line of a paragraph alone at the top of the next page", () => {
    // Page holds 4 lines; a 5-line paragraph must split. Splitting at 4/1
    // would strand 1 line alone at the top of the next page — instead at
    // least 2 lines should carry over together.
    const pages = paginateChapter([para("l1", "l2", "l3", "l4", "l5")], 4);
    expect(pages).toHaveLength(2);
    expect(pages[1]!.length).toBeGreaterThanOrEqual(2);
    expect(pages.flat()).toEqual(["l1", "l2", "l3", "l4", "l5"]);
  });

  it("never returns a trailing empty page", () => {
    // The paragraph exactly fills the page (2 lines, maxLinesPerPage=2),
    // which would otherwise push a blank page for the paragraph-gap step.
    const pages = paginateChapter([para("a", "b")], 2);
    expect(pages).toEqual([["a", "b"]]);
  });

  it("handles zero paragraphs by returning a single empty page", () => {
    expect(paginateChapter([], 10)).toEqual([[]]);
  });
});

let tempDir: string | undefined;

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("assembleManuscriptPdf", () => {
  it("gives every chapter its own opening page and writes a real, loadable PDF", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "typeset-test-"));
    const outputPath = join(tempDir, "interior.pdf");

    const { pageCount } = await assembleManuscriptPdf(
      [
        { title: "Front Matter", body: "A short front matter paragraph." },
        { title: "Chapter One", body: "A short first chapter." },
        { title: "Chapter Two", body: "A short second chapter." },
        { title: "Thank You", body: "A short back matter paragraph." },
      ],
      "Test Manuscript",
      outputPath
    );

    // At minimum, one page per chapter — each chapter starts fresh.
    expect(pageCount).toBeGreaterThanOrEqual(4);

    const pdfBytes = readFileSync(outputPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    expect(pdfDoc.getPageCount()).toBe(pageCount);
    const page = pdfDoc.getPage(0);
    expect(page.getWidth()).toBeCloseTo(612, 0);
    expect(page.getHeight()).toBeCloseTo(792, 0);
  });

  it("spans multiple pages for a chapter with a long body, without losing any text into overlap", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "typeset-test-"));
    const outputPath = join(tempDir, "interior.pdf");

    const longBody = Array.from({ length: 40 }, (_, i) => `Paragraph number ${i + 1} with a bit of real sentence content in it.`).join(
      "\n\n"
    );

    const { pageCount } = await assembleManuscriptPdf([{ title: "Long Chapter", body: longBody }], "Test Manuscript", outputPath);

    expect(pageCount).toBeGreaterThan(1);
    const pdfDoc = await PDFDocument.load(readFileSync(outputPath));
    expect(pdfDoc.getPageCount()).toBe(pageCount);
  });
});
