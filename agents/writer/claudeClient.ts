import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { parseToolResult } from "../scout/claudeClient.ts";

/**
 * Writer's one authorized external API call (see CLAUDE.md's "Authorized
 * external APIs" section): the Anthropic API, generating the full
 * manuscript text for a text-only category. This is the fourth and last
 * currently-authorized use of ANTHROPIC_API_KEY.
 */

const DEFAULT_MODEL = "claude-sonnet-5";
const MAX_TOKENS = 16000;

export interface ManuscriptSection {
  title: string;
  body: string;
}

export interface Manuscript {
  sections: ManuscriptSection[];
  frontMatterDraft: string;
  backMatterDraft: string;
}

const ManuscriptSectionSchema = z.object({
  title: z.string(),
  body: z.string(),
});

const ManuscriptSchema = z.object({
  sections: z.array(ManuscriptSectionSchema),
  frontMatterDraft: z.string(),
  backMatterDraft: z.string(),
});

export interface WriterClient {
  /** Generates a complete manuscript of sectionCount sections for the given category/theme. */
  generateManuscript(category: string, theme: string, sectionCount: number): Promise<Manuscript>;
}

function requireApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      "Writer requires ANTHROPIC_API_KEY to be set — it uses the Anthropic API to generate manuscript text (see CLAUDE.md's Authorized external APIs section). Refusing to fabricate placeholder text instead."
    );
  }
  return key;
}

const MANUSCRIPT_TOOL = {
  name: "report_manuscript",
  description: "Report a complete, ready-to-typeset manuscript for a KDP text-only book.",
  input_schema: {
    type: "object" as const,
    properties: {
      sections: {
        type: "array",
        description: "Every section of the manuscript, in reading order.",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "This section's title (a poem's title, a short story's title, a journal entry's prompt heading, etc.)." },
            body: {
              type: "string",
              description:
                "The complete, original, full-length text of this section — never a summary, outline, or placeholder.",
            },
          },
          required: ["title", "body"],
        },
      },
      frontMatterDraft: {
        type: "string",
        description: "Draft front matter: title page text, a short copyright/AI-disclosure line, and a brief introduction, appropriate to this category.",
      },
      backMatterDraft: {
        type: "string",
        description: "Draft back matter: a short thank-you note and a review request, appropriate to this category.",
      },
    },
    required: ["sections", "frontMatterDraft", "backMatterDraft"],
  },
};

export class AnthropicWriterClient implements WriterClient {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(options: { apiKey?: string; model?: string } = {}) {
    this.client = new Anthropic({ apiKey: options.apiKey ?? requireApiKey() });
    this.model = options.model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
  }

  async generateManuscript(category: string, theme: string, sectionCount: number): Promise<Manuscript> {
    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: MAX_TOKENS,
      tools: [MANUSCRIPT_TOOL],
      tool_choice: { type: "tool", name: MANUSCRIPT_TOOL.name },
      messages: [
        {
          role: "user",
          content: `You are Writer, the manuscript-generation step of a text-only KDP publishing pipeline. Category: "${category}". Theme/niche: "${theme}". Write a complete, ready-to-typeset manuscript of exactly ${sectionCount} sections (poems, short stories, or journal-prompt entries — whichever genuinely fits the category) built around this theme. Every section must be complete, original, full-length text in its own distinct voice or angle on the theme — never a summary, outline, placeholder, or repeat of another section. Then call report_manuscript with every section plus draft front and back matter appropriate to this category.`,
        },
      ],
    });

    return parseToolResult(message, MANUSCRIPT_TOOL.name, ManuscriptSchema, ["sections"]);
  }
}
