import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { parseToolResult } from "../scout/claudeClient.ts";

/**
 * Opportunity Scanner's one authorized external API call (see CLAUDE.md's
 * "Authorized external APIs" section): Claude with the native `web_search`
 * tool enabled, so category selection is grounded in live KDP
 * listing/trend signal rather than pure model estimate. Every report still
 * discloses that this is an automated estimate of demand, not certainty —
 * live search data narrows the guess, it doesn't remove it.
 */

const DEFAULT_MODEL = "claude-sonnet-5";

export type ContentType = "illustrated" | "text";

export interface CategoryCandidate {
  category: string;
  contentType: ContentType;
  score: number;
  rationale: string;
  /** True if this candidate's evaluation drew on real web_search results; false if it's the model's own estimate/reasoning. */
  groundedInLiveSearch: boolean;
}

export interface CategorySelection {
  candidates: CategoryCandidate[];
  selectedCategory: string;
  selectionRationale: string;
  /** Titles/URLs pulled from web_search_tool_result blocks in the response, for the audit trail. */
  sourcesConsulted: string[];
}

const CategoryCandidateSchema = z.object({
  category: z.string(),
  contentType: z.enum(["illustrated", "text"]),
  score: z.number(),
  rationale: z.string(),
  groundedInLiveSearch: z.boolean(),
});

const CategorySelectionSchema = z.object({
  candidates: z.array(CategoryCandidateSchema),
  selectedCategory: z.string(),
  selectionRationale: z.string(),
});

export interface OpportunityScannerClient {
  /** Researches and picks exactly one KDP category/format for the week, grounded in live web_search signal. */
  selectCategory(avoidCategories: string[]): Promise<CategorySelection>;
}

function requireApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      "Opportunity Scanner requires ANTHROPIC_API_KEY to be set — it uses the Anthropic API (with web_search) for category selection (see CLAUDE.md's Authorized external APIs section). Refusing to fabricate a selection instead."
    );
  }
  return key;
}

const REPORT_TOOL = {
  name: "report_category_selection",
  description:
    "Report every KDP category/format candidate considered, and which single one was selected for this week's pipeline run.",
  input_schema: {
    type: "object" as const,
    properties: {
      candidates: {
        type: "array",
        description: "Every candidate category considered, including the one ultimately selected.",
        items: {
          type: "object",
          properties: {
            category: { type: "string", description: "A specific KDP category/format, e.g. 'seasonal coloring books' or 'micro-fiction flash story collections'." },
            contentType: {
              type: "string",
              enum: ["illustrated", "text"],
              description: "'illustrated' if this category needs interior artwork (routes to Loom+Etch downstream), 'text' if it's a text-only manuscript (routes to Writer).",
            },
            score: { type: "number", description: "0-100, higher is more promising" },
            rationale: { type: "string" },
            groundedInLiveSearch: {
              type: "boolean",
              description: "true only if this candidate's evaluation actually used web_search results; false if it's the model's own estimate.",
            },
          },
          required: ["category", "contentType", "score", "rationale", "groundedInLiveSearch"],
        },
      },
      selectedCategory: { type: "string", description: "Must exactly match one candidate's category string." },
      selectionRationale: { type: "string" },
    },
    required: ["candidates", "selectedCategory", "selectionRationale"],
  },
};

const WEB_SEARCH_TOOL: Anthropic.Messages.WebSearchTool20250305 = {
  type: "web_search_20250305",
  name: "web_search",
  max_uses: 8,
};

function buildPrompt(avoidCategories: string[]): string {
  const avoidClause =
    avoidCategories.length > 0
      ? ` Avoid repeating, and prefer to avoid close variants of, these categories chosen in recent weeks (unless you have a strong, stated reason to revisit one): ${avoidCategories.join(", ")}.`
      : "";

  return `You are Opportunity Scanner, the weekly category-selection step of a KDP publishing pipeline. Use the web_search tool to check current Amazon KDP category/bestseller signal, review-count signal, and general trend signal, then propose 4-6 distinct candidate KDP book categories/formats worth pursuing this week — spanning both illustrated formats (coloring books, children's picture books) and text-only formats (poetry collections, short fiction, journals with written prompts), not just one kind. For each candidate, search for real signal before scoring it, and be honest in "groundedInLiveSearch" about whether your evaluation actually used search results or is your own estimate. Then pick exactly one category to pursue this week — the single best balance of demand signal and differentiation potential — and call report_category_selection with every candidate you considered and your selection.${avoidClause} Scope is Amazon KDP only (paperback/low-content or text-only formats) — do not propose anything outside KDP (no Etsy, Shopify, or general print-on-demand).`;
}

/** Extracts source titles/URLs from any web_search_tool_result blocks in the response, for the audit trail. */
function extractSources(message: Anthropic.Message): string[] {
  const sources: string[] = [];
  for (const block of message.content) {
    if (block.type !== "web_search_tool_result") continue;
    const content = block.content;
    if (!Array.isArray(content)) continue;
    for (const result of content) {
      if (result.type === "web_search_result") {
        sources.push(`${result.title} — ${result.url}`);
      }
    }
  }
  return sources;
}

function findToolUse(message: Anthropic.Message, toolName: string) {
  return message.content.find((b) => b.type === "tool_use" && b.name === toolName);
}

export class AnthropicOpportunityScannerClient implements OpportunityScannerClient {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(options: { apiKey?: string; model?: string } = {}) {
    this.client = new Anthropic({ apiKey: options.apiKey ?? requireApiKey() });
    this.model = options.model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
  }

  async selectCategory(avoidCategories: string[]): Promise<CategorySelection> {
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: buildPrompt(avoidCategories) }];

    // tool_choice is left "auto" (not forced) on this first call: forcing the
    // report tool immediately would pre-empt web_search entirely, since a
    // forced tool_choice is the model's very first action. Claude decides
    // when it's done researching and calls report_category_selection itself.
    let message = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      tools: [WEB_SEARCH_TOOL, REPORT_TOOL],
      tool_choice: { type: "auto" },
      messages,
    });

    let sources = extractSources(message);
    let toolUse = findToolUse(message, REPORT_TOOL.name);

    if (!toolUse) {
      // Claude finished researching without calling the report tool (e.g. it
      // just summarized in text). Retry once, forcing the tool now that any
      // web_search calls have already happened server-side within the first
      // response — this doesn't lose the research, it just requires Claude
      // to structure what it already found.
      messages.push({ role: "assistant", content: message.content });
      messages.push({
        role: "user",
        content: "Now call report_category_selection with your complete findings, every candidate considered, and your selection.",
      });
      message = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        tools: [WEB_SEARCH_TOOL, REPORT_TOOL],
        tool_choice: { type: "tool", name: REPORT_TOOL.name },
        messages,
      });
      sources = [...sources, ...extractSources(message)];
      toolUse = findToolUse(message, REPORT_TOOL.name);
    }

    if (!toolUse || toolUse.type !== "tool_use") {
      throw new Error(
        `Opportunity Scanner: Claude did not return a "${REPORT_TOOL.name}" tool call after a retry — cannot proceed without structured output.`
      );
    }

    const result = parseToolResult(message, REPORT_TOOL.name, CategorySelectionSchema, ["candidates"]);

    if (!result.candidates.some((c) => c.category === result.selectedCategory)) {
      throw new Error(
        `Opportunity Scanner: Claude's selectedCategory "${result.selectedCategory}" doesn't match any reported candidate's category.`
      );
    }

    return { ...result, sourcesConsulted: [...new Set(sources)] };
  }
}
