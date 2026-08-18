import type { ClaudeClient, ThemeSelection } from "./claudeClient.ts";

/**
 * Asks Claude to rank every queued candidate and pick one, then verifies
 * the response actually names one of the candidates before trusting it —
 * Scout fails loudly rather than silently proceeding on a hallucinated
 * theme that was never in the queue.
 */
export async function selectTheme(candidates: string[], client: ClaudeClient): Promise<ThemeSelection> {
  if (candidates.length === 0) {
    throw new Error("selectTheme requires at least one candidate theme.");
  }

  const selection = await client.selectTheme(candidates);

  const normalizedCandidates = new Set(candidates.map((c) => c.trim().toLowerCase()));
  if (!normalizedCandidates.has(selection.selectedTheme.trim().toLowerCase())) {
    throw new Error(
      `Scout: Claude selected "${selection.selectedTheme}", which isn't one of the queued candidates (${candidates.join(", ")}). Refusing to proceed on an invented theme.`
    );
  }

  return selection;
}
