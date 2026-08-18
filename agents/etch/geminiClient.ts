import { GoogleGenAI } from "@google/genai";

/**
 * Etch's one authorized external API call (see CLAUDE.md's "Authorized
 * external APIs" section). Every image produced here is disclosed in the
 * batch manifest as AI-generated (images.source === "etch").
 */

const DEFAULT_MODEL = "gemini-2.5-flash-image";
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 1000;

export interface ImageGenClient {
  /** Generates one image for the given prompt and returns its raw bytes. */
  generateImage(prompt: string): Promise<Buffer>;
}

function requireApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      "Etch requires GEMINI_API_KEY to be set — it uses the Gemini API to generate interior images (see CLAUDE.md's Authorized external APIs section). Refusing to fabricate placeholder images instead."
    );
  }
  return key;
}

interface ResponsePart {
  inlineData?: { data?: string };
  text?: string;
}

interface GenerateContentResponseLike {
  candidates?: { content?: { parts?: ResponsePart[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

export interface InterpretedResponse {
  /** Base64 image data, if Gemini actually returned an image. */
  imageBase64?: string;
  /** Human-readable explanation of why no image came back, when imageBase64 is undefined. */
  diagnostic: string;
  /** True when the response itself signals a deliberate content refusal — retrying won't help. */
  isDefiniteRefusal: boolean;
}

/**
 * Pulled out as a pure function so the parsing/diagnostic logic is
 * unit-testable without mocking the Gemini SDK client.
 */
export function interpretGenerateContentResponse(response: GenerateContentResponseLike): InterpretedResponse {
  const candidate = response.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const imagePart = parts.find((part) => part.inlineData?.data);

  if (imagePart?.inlineData?.data) {
    return { imageBase64: imagePart.inlineData.data, diagnostic: "", isDefiniteRefusal: false };
  }

  const textExplanation = parts.find((part) => typeof part.text === "string" && part.text.trim().length > 0)?.text;
  const blockReason = response.promptFeedback?.blockReason;
  const finishReason = candidate?.finishReason;

  const reasonFragments = [
    blockReason && `promptFeedback.blockReason=${blockReason}`,
    finishReason && finishReason !== "STOP" && `finishReason=${finishReason}`,
    textExplanation && `Gemini said: "${textExplanation}"`,
  ].filter((f): f is string => Boolean(f));

  const diagnostic =
    reasonFragments.length > 0
      ? reasonFragments.join("; ")
      : "no image data and no diagnostic information in the response (possibly a transient API issue)";

  // Any explicit signal (a block reason, a non-STOP finish reason, or explanatory
  // text) means Gemini deliberately declined this prompt — most likely its content
  // safety filters, since coloring-book prompts sometimes describe children or other
  // sensitive subjects. Retrying the identical prompt won't change that outcome.
  const isDefiniteRefusal = reasonFragments.length > 0;

  return { diagnostic, isDefiniteRefusal };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class GeminiImageClient implements ImageGenClient {
  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor(options: { apiKey?: string; model?: string } = {}) {
    this.client = new GoogleGenAI({ apiKey: options.apiKey ?? requireApiKey() });
    this.model = options.model ?? process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
  }

  async generateImage(prompt: string): Promise<Buffer> {
    let lastDiagnostic = "no diagnostic information in the response";

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: prompt,
      });

      const result = interpretGenerateContentResponse(response);
      if (result.imageBase64) {
        return Buffer.from(result.imageBase64, "base64");
      }

      lastDiagnostic = result.diagnostic;

      if (result.isDefiniteRefusal || attempt === MAX_ATTEMPTS) {
        break;
      }

      await sleep(RETRY_DELAY_MS);
    }

    throw new Error(`Etch: Gemini returned no image data for prompt "${prompt}" (${lastDiagnostic}).`);
  }
}
