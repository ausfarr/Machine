import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

/**
 * Sentinel's authorized external API call — the third and last use of
 * ANTHROPIC_API_KEY (see CLAUDE.md's "Authorized external APIs" section).
 * Scoped to this repo's own code and CI failures only; never touches
 * batch data, KDP, or any external account.
 */

const DEFAULT_MODEL = "claude-sonnet-5";

export interface SourceFile {
  path: string;
  content: string;
}

export interface DiagnosisInput {
  /** Raw CI failure output — a tsc/vitest log, a dependency-audit report, etc. */
  failureLog: string;
  /** Contents of the files the failure log points to, for real grounding. */
  files: SourceFile[];
}

export interface Diagnosis {
  /** Short, imperative one-liner for the PR title/commit message. */
  summary: string;
  /** Root-cause explanation for the PR body / a human reviewer. */
  diagnosis: string;
  /** True when Claude is confident enough in `patch` to propose it as a real fix. */
  confidentFix: boolean;
  /** A unified diff (git-apply compatible, paths relative to repo root), or "" when confidentFix is false. */
  patch: string;
}

const DiagnosisSchema = z
  .object({
    summary: z.string().min(1),
    diagnosis: z.string().min(1),
    confidentFix: z.boolean(),
    patch: z.string(),
  })
  .refine((d) => !d.confidentFix || d.patch.trim().length > 0, {
    message: "confidentFix is true but patch is empty",
  });

export interface SentinelClient {
  diagnose(input: DiagnosisInput): Promise<Diagnosis>;
}

function requireApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      "Sentinel requires ANTHROPIC_API_KEY to be set — it uses the Anthropic API to diagnose CI failures (see CLAUDE.md's Authorized external APIs section). Refusing to fabricate a diagnosis instead."
    );
  }
  return key;
}

const DIAGNOSE_TOOL = {
  name: "report_diagnosis",
  description: "Report a diagnosis of a CI failure in this repo, plus an optional proposed fix.",
  input_schema: {
    type: "object" as const,
    properties: {
      summary: { type: "string", description: "A short, imperative one-line summary (fit for a PR title), e.g. \"Fix type error in agents/etch/index.ts\"." },
      diagnosis: { type: "string", description: "Explain what broke and why, in plain language, for a human reviewer." },
      confidentFix: {
        type: "boolean",
        description: "True only if you are confident `patch` is a correct, minimal fix. False if the failure needs a human to decide (e.g. a real product bug, an ambiguous root cause, or a fix that would need to touch files you weren't given).",
      },
      patch: {
        type: "string",
        description:
          "A unified diff fixing the failure, in `git apply` format (paths relative to the repo root, `a/`/`b/` prefixes, correct hunk headers). Empty string if confidentFix is false. Only touch this repo's own code/config — never batch data.",
      },
    },
    required: ["summary", "diagnosis", "confidentFix", "patch"],
  },
};

export class AnthropicSentinelClient implements SentinelClient {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(options: { apiKey?: string; model?: string } = {}) {
    this.client = new Anthropic({ apiKey: options.apiKey ?? requireApiKey() });
    this.model = options.model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
  }

  async diagnose(input: DiagnosisInput): Promise<Diagnosis> {
    const filesBlock =
      input.files.length > 0
        ? input.files.map((f) => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``).join("\n\n")
        : "(No source files could be identified from the failure log.)";

    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      tools: [DIAGNOSE_TOOL],
      tool_choice: { type: "tool", name: DIAGNOSE_TOOL.name },
      messages: [
        {
          role: "user",
          content: `You are Sentinel, the CI self-repair step for a coloring-book publishing pipeline's own codebase (TypeScript/Node, this repo only — never touch batch data, KDP, or any external account). A CI run failed. Diagnose it and, only if you are genuinely confident, propose a minimal unified-diff fix.\n\nFailure log:\n\`\`\`\n${input.failureLog}\n\`\`\`\n\nRelevant files:\n${filesBlock}\n\nIf the failure log didn't give you enough to work with, or the real fix needs files you don't have, set confidentFix to false and leave patch empty rather than guessing — a human will read your diagnosis either way.`,
        },
      ],
    });

    return parseDiagnosis(message);
  }
}

export function parseDiagnosis(message: Anthropic.Message): Diagnosis {
  const block = message.content.find((b) => b.type === "tool_use" && b.name === DIAGNOSE_TOOL.name);
  if (!block || block.type !== "tool_use") {
    throw new Error("Sentinel: Claude did not return a diagnosis tool call — cannot proceed without structured output.");
  }

  let input: unknown = block.input;
  if (typeof input === "string") {
    try {
      input = JSON.parse(input);
    } catch (err) {
      throw new Error(
        `Sentinel: Claude's diagnosis tool call returned a string that isn't valid JSON (${err instanceof Error ? err.message : err}).`
      );
    }
  }

  const result = DiagnosisSchema.safeParse(input);
  if (!result.success) {
    throw new Error(`Sentinel: Claude's diagnosis didn't match the expected shape: ${result.error.message}.`);
  }
  return result.data;
}
