import Anthropic from "@anthropic-ai/sdk";

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

export interface ClaudeClient {
  /** Proposes fresh candidate themes so the pipeline never depends on a human having pre-populated theme-queue.json. */
  generateCandidateThemes(count: number, avoidThemes: string[]): Promise<string[]>;
  /** Ranks every candidate and picks the one to pursue next. */
  selectTheme(candidates: string[]): Promise<ThemeSelection>;
  /** Deep-dives the selected theme for the research report. */
  analyzeTheme(theme: string): Promise<ThemeAnalysis>;
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

  async generateCandidateThemes(count: number, avoidThemes: string[]): Promise<string[]> {
    const tool = {
      name: "report_candidate_themes",
      description: "Report a list of candidate coloring-book theme ideas.",
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
          content: `You are Scout, the niche/keyword research step of a coloring-book publishing pipeline sold on Amazon KDP. Propose ${count} distinct, evergreen coloring-book theme ideas worth researching next. Prefer specific, differentiated angles (a style, audience, or motif) over generic broad nouns that are likely saturated. Each theme string gets used downstream as literal wording in an image-generation prompt, so keep every theme itself simple and concrete (a subject, setting, or style) — do not describe a target audience's emotional or mental state (e.g. "for anxious kids," "for grieving readers"); that framing adds nothing for a colorist choosing a book and can trip an image model's content-safety filters.${avoidClause}`,
        },
      ],
    });

    const result = parseToolResult<{ themes: string[] }>(message, tool.name);
    return result.themes;
  }

  async selectTheme(candidates: string[]): Promise<ThemeSelection> {
    const tool = {
      name: "report_theme_selection",
      description: "Report the ranked candidate coloring-book themes and which one to pursue next.",
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
          content: `You are Scout, the niche/keyword research step of a coloring-book publishing pipeline sold on Amazon KDP. Evaluate these candidate themes for a coloring book and pick the single best one to pursue next, considering likely competition level, differentiation potential, and evergreen appeal. Candidates:\n${candidates.map((c, i) => `${i + 1}. ${c}`).join("\n")}`,
        },
      ],
    });

    return parseToolResult<ThemeSelection>(message, tool.name);
  }

  async analyzeTheme(theme: string): Promise<ThemeAnalysis> {
    const tool = {
      name: "report_theme_analysis",
      description: "Report a competition/angle/keyword analysis for one coloring-book theme.",
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
          content: `You are Scout, the niche/keyword research step of a coloring-book publishing pipeline sold on Amazon KDP. Research this theme for a coloring book: "${theme}". Estimate its Amazon KDP competition level, suggest one concrete differentiating angle, and propose keyword variants a shopper might search.`,
        },
      ],
    });

    return parseToolResult<ThemeAnalysis>(message, tool.name);
  }
}

function parseToolResult<T>(message: Anthropic.Message, toolName: string): T {
  const block = message.content.find((b) => b.type === "tool_use" && b.name === toolName);
  if (!block || block.type !== "tool_use") {
    throw new Error(`Scout: Claude did not return a "${toolName}" tool call — cannot proceed without structured output.`);
  }
  return block.input as T;
}
