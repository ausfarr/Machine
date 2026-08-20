/**
 * Loom has no image-generation or subject-extraction API — CLAUDE.md
 * states Loom "does not call any image generation API," and no other
 * external API is authorized for it either. So prompts are built by
 * crossing the human-approved theme with a fixed library of composition
 * and framing templates, not by inventing "real" subject research.
 *
 * Prompt style is category-aware: each IllustrationStyle below is a
 * self-contained set of interior/cover style guidance, composition
 * templates, and front/back matter copy for one illustrated KDP format.
 * Loom picks a style per batch (see index.ts) and never mixes wording
 * across styles within a single batch.
 */

import type { IllustrationStyle } from "../../schemas/manifest.ts";
import { buildTitle } from "../crier/templates.ts";

export type { IllustrationStyle };

export interface IllustrationStyleTemplates {
  styleGuidance: string;
  coverStyleGuidance: string;
  compositionTemplates: readonly string[];
  buildCoverPrompt(theme: string): string;
  generateFrontMatterDraft(theme: string): string;
  generateBackMatterDraft(theme: string): string;
}

const COLORING_BOOK_STYLE_GUIDANCE =
  "Black-and-white line art only: bold, clean outlines, no shading, no gradients, no color, no gray fill, white background. Designed for an 8.5x11in KDP coloring book interior page, single subject per page unless the prompt says otherwise.";

/**
 * Front covers are the one full-color image in a batch — unlike the
 * black-and-white interior, this needs to sell the book at Amazon
 * thumbnail size. The title is rendered as part of the illustration itself
 * (see buildCoverPrompt), not composited on afterward.
 */
const COLORING_BOOK_COVER_STYLE_GUIDANCE =
  "Full-color, vibrant, richly detailed illustration suitable as a KDP coloring book front cover — eye-catching even at small thumbnail size. Portrait orientation.";

const COLORING_BOOK_COMPOSITION_TEMPLATES: readonly string[] = [
  "A close-up view of {theme}, bold clean linework, no shading, no color, white background, coloring book page.",
  "A wide establishing shot of {theme} with layered background detail, bold outlines, no color, coloring book page.",
  "{theme} viewed from a low angle looking upward, dramatic perspective, bold linework, no color, coloring book page.",
  "A symmetrical, centered composition of {theme} with a decorative border, bold outlines, no color, coloring book page.",
  "{theme} at sunrise, soft light rays suggested through simple line hatching, no color, coloring book page.",
  "{theme} surrounded by small decorative corner motifs, bold linework, no color, coloring book page.",
  "A whimsical, slightly exaggerated illustrative rendition of {theme}, bold outlines, no color, coloring book page.",
  "A highly detailed, intricate rendition of {theme} for experienced colorists, fine linework, no color.",
  "A simplified, bold-outline rendition of {theme} suitable for beginners, minimal detail, no color.",
  "{theme} shown in cross-section or cutaway view revealing interior detail, bold linework, no color.",
  "{theme} paired with a small decorative pattern in one corner, bold outlines, no color.",
  "A night-time version of {theme} with stars or moon suggested via simple line elements, no color.",
  "{theme} from a bird's-eye, top-down view, bold outlines, no color.",
  "A close-up of one distinctive detail from {theme}, dramatically enlarged, bold linework, no color.",
  "{theme} framed inside a circular vignette, bold outlines, no color.",
  "{theme} set against a decorative patterned background, bold outlines, no color.",
  "Two elements of {theme} mirrored symmetrically across the page, bold outlines, no color.",
  "{theme} rendered with an ornate decorative border in an Art Nouveau style, bold linework, no color.",
  "{theme} shown mid-action, a dynamic in-progress moment, bold outlines, no color.",
  "A quiet, still-life style arrangement featuring {theme}, bold outlines, no color.",
  "{theme} depicted as a two-page spread composition, bold outlines, no color.",
  "{theme} with a small hidden-detail element added for the colorist to find, bold outlines, no color.",
  "A stylized silhouette-and-outline hybrid treatment of {theme}, bold shapes, no color.",
  "{theme} shown at three different scales stacked vertically on the page, bold outlines, no color.",
  "{theme} framed by a decorative banner left blank at the top of the page, bold outlines, no color.",
  "A textured, hand-drawn sketch feel applied to {theme}, bold outlines, no color.",
  "{theme} combined with smaller complementary background elements for texture, bold outlines, no color.",
  "A seasonal variant of {theme} with simple seasonal line details, no color.",
  "{theme} in a whimsical storybook illustration style, bold outlines, no color.",
  "A macro, extreme-close-up study of texture within {theme}, bold linework, no color.",
];

/** Same title Crier independently builds for listing.json — imported so the two never diverge. */
function buildColoringBookCoverPrompt(theme: string): string {
  const title = buildTitle(theme, "coloring-book");
  return `A striking front-cover illustration capturing the essence of ${theme.toLowerCase()}, warm and inviting, suitable to sell a coloring book at a glance. Prominently and legibly integrate the title "${title}" into the illustration as attractive, well-composed cover typography.`;
}

function generateColoringBookFrontMatterDraft(theme: string): string {
  return [
    `Title page: "${theme}: A Coloring Book"`,
    `Copyright page: (c) [YEAR] [PUBLISHER NAME]. All rights reserved. Interior illustrations created with AI-assisted image generation; a human curated and selected every page.`,
    `Introduction (short, 2-3 sentences): Welcome the colorist to this collection of ${theme.toLowerCase()} illustrations, note the single-sided page layout, and invite them to test markers on the back of a page first.`,
  ].join("\n\n");
}

function generateColoringBookBackMatterDraft(theme: string): string {
  return [
    `Thank you for coloring "${theme}"! We hope these pages brought a few relaxing hours.`,
    `If you enjoyed this book, a short review helps other colorists find it — we'd be grateful for a few words.`,
    `Look for more coloring books in this series.`,
  ].join("\n\n");
}

const PICTURE_BOOK_STYLE_GUIDANCE =
  "Full-color, warm, richly detailed children's-picture-book illustration: soft painterly or gouache-style rendering, consistent character and setting design across pages, gentle expressive lighting. Designed for an 8.5x11in KDP interior page, one scene per page unless the prompt says otherwise.";

const PICTURE_BOOK_COVER_STYLE_GUIDANCE =
  "Full-color, vibrant, richly detailed children's-picture-book cover illustration — warm and inviting, eye-catching even at small thumbnail size. Portrait orientation.";

const PICTURE_BOOK_COMPOSITION_TEMPLATES: readonly string[] = [
  "A warm, inviting picture-book scene introducing {theme}, soft painterly rendering, gentle expressive lighting, full color.",
  "A wide establishing scene of the world of {theme}, layered background detail, warm color palette, full color.",
  "{theme} viewed from a child's-eye low angle, full of wonder, soft painterly rendering, full color.",
  "A cozy, centered picture-book composition of {theme} with a decorative page border, full color.",
  "{theme} at sunrise, soft golden light, gentle painterly shading, full color.",
  "{theme} surrounded by small whimsical decorative details, warm color palette, full color.",
  "A playful, slightly exaggerated picture-book rendition of {theme}, expressive character poses, full color.",
  "A richly detailed picture-book spread of {theme} for a curious young reader, full color.",
  "A simplified, gentle rendition of {theme} suitable for the youngest readers, soft shapes, full color.",
  "{theme} shown mid-adventure, a dynamic storybook moment, warm color palette, full color.",
  "{theme} paired with a small charming background detail in one corner, full color.",
  "A cozy night-time version of {theme} with stars or moonlight, soft painterly rendering, full color.",
  "{theme} from a bird's-eye, storybook-map perspective, full color.",
  "A close-up, tender moment featuring {theme}, warm expressive lighting, full color.",
  "{theme} framed inside a decorative storybook vignette, full color.",
  "{theme} set against a richly patterned, whimsical background, full color.",
  "Two characters or elements of {theme} sharing a warm interaction, full color.",
  "{theme} rendered with an ornate decorative border in a classic storybook style, full color.",
  "{theme} shown mid-action, a joyful in-progress moment, full color.",
  "A quiet, cozy still-life-style arrangement featuring {theme}, full color.",
  "{theme} depicted as a two-page spread composition, full color.",
  "{theme} with a small hidden, delightful detail for the reader to find, full color.",
  "A soft, dreamlike treatment of {theme}, gentle color washes, full color.",
  "{theme} shown at three different scales across the page, full color.",
  "{theme} framed by a decorative banner left blank at the top of the page, full color.",
  "A textured, hand-painted feel applied to {theme}, full color.",
  "{theme} combined with smaller complementary background elements for warmth, full color.",
  "A seasonal variant of {theme} with simple seasonal details, full color.",
  "{theme} in a classic whimsical storybook illustration style, full color.",
  "A gentle, close-up study of one charming detail within {theme}, full color.",
];

function buildPictureBookCoverPrompt(theme: string): string {
  const title = buildTitle(theme, "picture-book");
  return `A warm, inviting front-cover illustration capturing the heart of ${theme.toLowerCase()}, suitable to sell a children's picture book at a glance. Prominently and legibly integrate the title "${title}" into the illustration as attractive, well-composed cover typography.`;
}

function generatePictureBookFrontMatterDraft(theme: string): string {
  return [
    `Title page: "${theme}: A Picture Book"`,
    `Copyright page: (c) [YEAR] [PUBLISHER NAME]. All rights reserved. Interior illustrations created with AI-assisted image generation; a human curated and selected every page.`,
    `Introduction (short, 2-3 sentences): Welcome the young reader (and whoever's reading along) to this story about ${theme.toLowerCase()}, and set a warm, inviting tone for what follows.`,
  ].join("\n\n");
}

function generatePictureBookBackMatterDraft(theme: string): string {
  return [
    `Thank you for reading "${theme}"! We hope this story brought a smile.`,
    `If you enjoyed this book, a short review helps other families find it — we'd be grateful for a few words.`,
    `Look for more picture books in this series.`,
  ].join("\n\n");
}

export const ILLUSTRATION_STYLES: Record<IllustrationStyle, IllustrationStyleTemplates> = {
  "coloring-book": {
    styleGuidance: COLORING_BOOK_STYLE_GUIDANCE,
    coverStyleGuidance: COLORING_BOOK_COVER_STYLE_GUIDANCE,
    compositionTemplates: COLORING_BOOK_COMPOSITION_TEMPLATES,
    buildCoverPrompt: buildColoringBookCoverPrompt,
    generateFrontMatterDraft: generateColoringBookFrontMatterDraft,
    generateBackMatterDraft: generateColoringBookBackMatterDraft,
  },
  "picture-book": {
    styleGuidance: PICTURE_BOOK_STYLE_GUIDANCE,
    coverStyleGuidance: PICTURE_BOOK_COVER_STYLE_GUIDANCE,
    compositionTemplates: PICTURE_BOOK_COMPOSITION_TEMPLATES,
    buildCoverPrompt: buildPictureBookCoverPrompt,
    generateFrontMatterDraft: generatePictureBookFrontMatterDraft,
    generateBackMatterDraft: generatePictureBookBackMatterDraft,
  },
};

/** Preserves v1 behavior for a batch with no Opportunity Scanner data (e.g. `npm run scout` run directly on a theme for manual testing). */
export const DEFAULT_ILLUSTRATION_STYLE: IllustrationStyle = "coloring-book";

export function buildPrompt(theme: string, template: string): string {
  return template.replace("{theme}", theme);
}
