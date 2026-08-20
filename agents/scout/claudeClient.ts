import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

/**
 * Scout's one authorized external API call (see CLAUDE.md's "Authorized
 * external APIs" section). Everything Claude returns here is presented as
 * an LLM's estimate, never as real Amazon/Google search-volume data.
 */

const DEFAULT_MODEL = "claude-sonnet-5";

export type CompetitionLevel = "low" | "medium" | "high";

export interface ThemeAnalysis {
  competitionLevel: CompetitionLevel;
  competitionRationale: string;
  suggestedAngle: string;
  keywordVariants: string[];
}

export interface ThemeRanking {
  theme: string;
  score: number;
  rationale: string;
}

export interface ThemeSelection {
  selectedTheme: string;
  selectionRationale: string;
  rankings: ThemeRanking[];
}

const ThemeAnalysisSchema = z.object({
  competitionLevel: z.enum(["low", "medium", "high"]),
  competitionRationale: z.string(),
  suggestedAngle: z.string(),
  keywordVariants: z.array(z.string()),
});

const ThemeRankingSchema = z.object({
  theme: z.string(),
  score: z.number(),
  rationale: z.string(),
});

const ThemeSelectionSchema = z.object({
  selectedTheme: z.string(),
  selectionRationale: z.string(),
  rankings: z.array(ThemeRankingSchema),
});

export const CandidateThemesSchema = z.object({
  themes: z.array(z.string()),
});

/** Preserves v1 behavior for a call with no category context (e.g. `npm run scout` run directly on a theme for manual testing). */
export const DEFAULT_CATEGORY = "coloring book";

export interface ClaudeClient {
  /** Proposes fresh candidate themes so the pipeline never depends on a human having pre-populated theme-queue.json. `category` scopes ideas to the KDP category/format Opportunity Scanner selected — see CLAUDE.md's Scout section. */
  generateCandidateThemes(count: number, avoidThemes: string[], category?: string): Promise<string[]>;
  /** Ranks every candidate and picks the one to pursue next, within the given category. */
  selectTheme(candidates: string[], category?: string): Promise<ThemeSelection>;
  /** Deep-dives the selected theme for the research report, within the given category. */
  analyzeTheme(theme: string, category?: string): Promise<ThemeAnalysis>;
}

function requireApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      "Scout requires ANTHROPIC_API_KEY to be set — it uses the Anthropic API for research and theme selection (see CLAUDE.md's Authorized external APIs section). Refusing to fabricate research output instead."
    );
  }
  return key;
}

export class AnthropicClaudeClient implements ClaudeClient {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(options: { apiKey?: string; model?: string } = {}) {
    this.client = new Anthropic({ apiKey: options.apiKey ?? requireApiKey() });
    this.model = options.model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
  }

  async generateCandidateThemes(count: number, avoidThemes: string[], category: string = DEFAULT_CATEGORY): Promise<string[]> {
    const tool = {
      name: "report_candidate_themes",
      description: `Report a list of candidate ${category} theme ideas.`,
      input_schema: {
        type: "object" as const,
        properties: {
          themes: {
            type: "array",
            items: { type: "string" },
            description: `Exactly ${count} distinct candidate theme strings.`,
          },
        },
        required: ["themes"],
      },
    };

    const avoidClause =
      avoidThemes.length > 0
        ? ` Do not repeat, and prefer to avoid close variants of, these already-produced themes: ${avoidThemes.join(", ")}.`
        : "";

    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
      messages: [
        {
          role: "user",
          content: `You are Scout, the niche/keyword research step of a ${category} publishing pipeline sold on Amazon KDP. Propose ${count} distinct, evergreen ${category} theme ideas worth researching next. Prefer specific, differentiated angles (a style, audience, or motif) over generic broad nouns that are likely saturated. Each theme string gets used downstream as literal wording in a generation prompt, so keep every theme itself simple and concrete (a subject, setting, or style) — do not describe a target audience's emotional or mental state (e.g. "for anxious kids," "for grieving readers"); that framing adds nothing for a shopper choosing a book and can trip a downstream generation model's content-safety filters.${avoidClause}`,
        },
      ],
    });

    const result = parseToolResult(message, tool.name, CandidateThemesSchema, ["themes"]);
    return result.themes;
  }

  async selectTheme(candidates: string[], category: string = DEFAULT_CATEGORY): Promise<ThemeSelection> {
    const tool = {
      name: "report_theme_selection",
      description: `Report the ranked candidate ${category} themes and which one to pursue next.`,
      input_schema: {
        type: "object" as const,
        properties: {
          rankings: {
            type: "array",
            items: {
              type: "object",
              properties: {
                theme: { type: "string" },
                score: { type: "number", description: "0-100, higher is more promising" },
                rationale: { type: "string" },
              },
              required: ["theme", "score", "rationale"],
            },
          },
          selectedTheme: { type: "string", description: "Must be the theme with the highest score" },
          selectionRationale: { type: "string" },
        },
        required: ["rankings", "selectedTheme", "selectionRationale"],
      },
    };

    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 2048,
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
      messages: [
        {
          role: "user",
          content: `You are Scout, the niche/keyword research step of a ${category} publishing pipeline sold on Amazon KDP. Evaluate these candidate themes for a ${category} and pick the single best one to pursue next, considering likely competition level, differentiation potential, and evergreen appeal. Candidates:\n${candidates.map((c, i) => `${i + 1}. ${c}`).join("\n")}`,
        },
      ],
    });

    return parseToolResult(message, tool.name, ThemeSelectionSchema, ["rankings"]);
  }

  async analyzeTheme(theme: string, category: string = DEFAULT_CATEGORY): Promise<ThemeAnalysis> {
    const tool = {
      name: "report_theme_analysis",
      description: `Report a competition/angle/keyword analysis for one ${category} theme.`,
      input_schema: {
        type: "object" as const,
        properties: {
          competitionLevel: { type: "string", enum: ["low", "medium", "high"] },
          competitionRationale: { type: "string" },
          suggestedAngle: {
            type: "string",
            description: "A concrete way to differentiate this theme from generic listings in the same niche.",
          },
          keywordVariants: {
            type: "array",
            items: { type: "string" },
            description: "4-8 candidate KDP search keyword phrases for this theme.",
          },
        },
        required: ["competitionLevel", "competitionRationale", "suggestedAngle", "keywordVariants"],
      },
    };

    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 1536,
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
      messages: [
        {
          role: "user",
          content: `You are Scout, the niche/keyword research step of a ${category} publishing pipeline sold on Amazon KDP. Research this theme for a ${category}: "${theme}". Estimate its Amazon KDP competition level, suggest one concrete differentiating angle, and propose keyword variants a shopper might search.`,
        },
      ],
    });

    return parseToolResult(message, tool.name, ThemeAnalysisSchema, ["keywordVariants"]);
  }
}

/**
 * Recovers a plain delimited list (one item per line, optionally with a
 * "- ", "* ", or "1. " list marker; or semicolon-separated) into an array
 * of trimmed, non-empty items. Returns undefined if the string doesn't
 * look like a multi-item list, so the caller can leave it untouched.
 * Deliberately does not split on bare commas — a single item can
 * legitimately contain one (e.g. a theme phrased "Coastal Cabins, Nordic
 * Style"), so a comma split risks corrupting rather than recovering data.
 */
function splitDelimitedList(value: string): string[] | undefined {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter((line) => line.length > 0);
  if (lines.length > 1) {
    return lines;
  }

  const semicolonParts = value
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (semicolonParts.length > 1) {
    return semicolonParts;
  }

  return undefined;
}

/**
 * Claude's tool calls occasionally return an array-typed property as a
 * string instead of a real nested array (a known structured-output
 * quirk, not specific to any one field) — either JSON-encoded
 * (`'["a","b"]'`) or a plain delimited list (`"a\nb"`). This coerces each
 * named field back into an array before validation, rather than
 * rejecting a perfectly recoverable response outright. A field that
 * isn't a string, or a string that doesn't look like either shape, is
 * left untouched — the schema below still reports a precise, honest
 * validation error for anything genuinely malformed, and that error
 * includes the field's raw value so an unrecognized shape is diagnosable
 * without another round trip.
 */
function recoverStringifiedArrayFields(input: unknown, fields: string[]): unknown {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return input;
  }
  const record = input as Record<string, unknown>;
  const fixed: Record<string, unknown> = { ...record };
  for (const field of fields) {
    const value = fixed[field];
    if (typeof value !== "string") continue;

    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) {
        fixed[field] = parsed;
        continue;
      }
      // Double-wrapped case: the field's string value is itself the whole
      // tool-input object again (e.g. themes: '{"themes": [...]}'), not
      // just the array — observed in practice, not hypothetical. Unwrap
      // one level rather than treating it as unrecoverable.
      if (parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>)[field])) {
        fixed[field] = (parsed as Record<string, unknown>)[field];
        continue;
      }
    } catch {
      // Not JSON — fall through to delimiter-based recovery below.
    }

    const split = splitDelimitedList(value);
    if (split) {
      fixed[field] = split;
    }
  }
  return fixed;
}

/**
 * Validates the tool call's input against its expected shape instead of
 * trusting it with an unchecked cast. The Anthropic API is documented to
 * always deliver tool_use input as parsed JSON, but a degraded response
 * (e.g. a tool call that got cut off, or an array-typed field nested as a
 * JSON string) can still arrive malformed — this fails loudly right here,
 * with a specific diagnostic, instead of letting garbage (like a JSON
 * string silently spread into individual characters by a downstream
 * ...spread) propagate into a confusing error three functions away.
 * `arrayFields` names any top-level properties expected to be arrays, so
 * the JSON-encoded-string variant of that quirk can be recovered first.
 */
export function parseToolResult<T>(
  message: Anthropic.Message,
  toolName: string,
  schema: z.ZodType<T>,
  arrayFields: string[] = []
): T {
  const block = message.content.find((b) => b.type === "tool_use" && b.name === toolName);
  if (!block || block.type !== "tool_use") {
    throw new Error(`Scout: Claude did not return a "${toolName}" tool call — cannot proceed without structured output.`);
  }

  let input: unknown = block.input;
  if (typeof input === "string") {
    try {
      input = JSON.parse(input);
    } catch (err) {
      throw new Error(
        `Scout: Claude's "${toolName}" tool call returned a string that isn't valid JSON (${err instanceof Error ? err.message : err}): ${input}`
      );
    }
  }

  input = recoverStringifiedArrayFields(input, arrayFields);

  const result = schema.safeParse(input);
  if (!result.success) {
    const record = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
    const rawValues = arrayFields
      .filter((field) => typeof record[field] === "string")
      .map((field) => `${field}=${JSON.stringify(record[field])}`);
    const rawValuesSuffix = rawValues.length > 0 ? ` Raw value(s) that failed recovery: ${rawValues.join(", ")}.` : "";
    throw new Error(
      `Scout: Claude's "${toolName}" tool call didn't match the expected shape: ${result.error.message}.${rawValuesSuffix}`
    );
  }
  return result.data;
}
