/**
 * Default number of coloring pages Loom generates per batch. Edit this
 * number to change the page count for all future pipeline runs (both
 * `npm run loom` and the full `npm run process-queue` pipeline).
 */
export const PROMPT_COUNT = 24;

/**
 * Author/imprint name printed on every batch's generated cover. Edit this
 * to your actual pen name or publishing imprint.
 */
export const AUTHOR_NAME = "AUSTIN F.";

/**
 * Default number of sections (poems / short stories / journal-prompt
 * entries — whichever fits the category) Writer generates per manuscript.
 * Kept modest so a full manuscript fits in one non-streaming Claude call;
 * raise it if a category needs a longer book and the model's max_tokens
 * budget (see agents/writer/claudeClient.ts) is raised to match.
 */
export const MANUSCRIPT_SECTION_COUNT = 15;
