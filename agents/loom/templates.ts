/**
 * Loom has no image-generation or subject-extraction API — CLAUDE.md
 * states Loom "does not call any image generation API," and no other
 * external API is authorized for it either. So prompts are built by
 * crossing the human-approved theme with a fixed library of composition
 * and framing templates, not by inventing "real" subject research.
 */

export const STYLE_GUIDANCE =
  "Black-and-white line art only: bold, clean outlines, no shading, no gradients, no color, no gray fill, white background. Designed for an 8.5x11in KDP coloring book interior page, single subject per page unless the prompt says otherwise.";

export const COMPOSITION_TEMPLATES: readonly string[] = [
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

export function buildPrompt(theme: string, template: string): string {
  return template.replace("{theme}", theme);
}

export function generateFrontMatterDraft(theme: string): string {
  return [
    `Title page: "${theme}: A Coloring Book"`,
    `Copyright page: (c) [YEAR] [PUBLISHER NAME]. All rights reserved. Interior illustrations created with AI-assisted image generation; a human curated and selected every page.`,
    `Introduction (short, 2-3 sentences): Welcome the colorist to this collection of ${theme.toLowerCase()} illustrations, note the single-sided page layout, and invite them to test markers on the back of a page first.`,
  ].join("\n\n");
}

export function generateBackMatterDraft(theme: string): string {
  return [
    `Thank you for coloring "${theme}"! We hope these pages brought a few relaxing hours.`,
    `If you enjoyed this book, a short review helps other colorists find it — we'd be grateful for a few words.`,
    `Look for more coloring books in this series.`,
  ].join("\n\n");
}
