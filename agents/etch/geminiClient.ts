import { GoogleGenAI, Modality } from "@google/genai";

/**
 * Etch's one authorized external API call (see CLAUDE.md's "Authorized
 * external APIs" section). Every image produced here is disclosed in the
 * batch manifest as AI-generated (images.source === "etch").
 *
 * Uses Gemini's multimodal `models.generateContent` endpoint with
 * `responseModalities: [IMAGE, TEXT]`, requesting a member of the Gemini
 * 3.x image family (aka "Nano Banana"). The dedicated Imagen
 * `models.generateImages`/`predict` endpoint this used to call was fully
 * shut down (all Imagen model versions, including 3 and 4, were retired
 * by Google) — `generateContent` is the only image-generation path Gemini
 * still offers. That reintroduces the failure mode Imagen used to
 * structurally rule out: a chat-style model can respond with prose
 * instead of (or alongside) an image. Requesting TEXT as a secondary
 * modality means that when it does, the response carries the explanation
 * as diagnosable text rather than an unexplained empty result.
 */

const DEFAULT_MODEL = "gemini-3.1-flash-image";
/** Closest supported aspect ratio to an 8.5x11in portrait KDP page. */
const IMAGE_ASPECT_RATIO = "3:4";
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1500;

/** finishReasons that signal a deliberate content refusal — retrying won't help. */
const REFUSAL_FINISH_REASONS = new Set(["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION"]);

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

interface PartLike {
  inlineData?: { data?: string };
  text?: string;
}

interface CandidateLike {
  content?: { parts?: PartLike[] };
  finishReason?: string;
}

interface GenerateContentResponseLike {
  candidates?: CandidateLike[];
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
  if (response.promptFeedback?.blockReason) {
    return { diagnostic: `blockReason=${response.promptFeedback.blockReason}`, isDefiniteRefusal: true };
  }

  const candidate = response.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];

  const imagePart = parts.find((part) => part.inlineData?.data);
  if (imagePart?.inlineData?.data) {
    return { imageBase64: imagePart.inlineData.data, diagnostic: "", isDefiniteRefusal: false };
  }

  const text = parts
    .map((part) => part.text)
    .filter((t): t is string => Boolean(t))
    .join(" ")
    .trim();

  const finishReason = candidate?.finishReason;
  const isDefiniteRefusal = Boolean(finishReason && REFUSAL_FINISH_REASONS.has(finishReason));

  if (finishReason || text) {
    const diagnosticParts = [finishReason && `finishReason=${finishReason}`, text && `text="${text}"`].filter(
      Boolean
    );
    return { diagnostic: diagnosticParts.join(", "), isDefiniteRefusal };
  }

  return {
    diagnostic: "no generated image and no diagnostic information in the response (possibly a transient API issue)",
    isDefiniteRefusal: false,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The Gemini SDK throws (rather than returning a normal response) on an
 * HTTP-level failure, with a message like "got status: 503 Service
 * Unavailable. {...}". A 5xx (server-side outage, deadline exceeded) or
 * 429 (rate limited) is worth retrying; a 4xx like 400/401/403/404 means
 * the request itself is wrong and will fail identically every time, so
 * retrying just burns quota. A message with no parseable status (a raw
 * network error) is treated as transient, since there's no signal it's a
 * permanent problem with the request.
 */
export function isRetryableApiError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const match = message.match(/got status:\s*(\d{3})/);
  if (!match) {
    return true;
  }
  const status = Number(match[1]);
  return status === 429 || (status >= 500 && status < 600);
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
      let response: Awaited<ReturnType<typeof this.client.models.generateContent>>;
      try {
        response = await this.client.models.generateContent({
          model: this.model,
          contents: prompt,
          config: {
            responseModalities: [Modality.IMAGE, Modality.TEXT],
            imageConfig: { aspectRatio: IMAGE_ASPECT_RATIO },
          },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!isRetryableApiError(err) || attempt === MAX_ATTEMPTS) {
          throw new Error(`Etch: Gemini API call failed for prompt "${prompt}" (${message}).`);
        }
        lastDiagnostic = `API call failed: ${message}`;
        await sleep(RETRY_DELAY_MS * attempt);
        continue;
      }

      const result = interpretGenerateContentResponse(response);
      if (result.imageBase64) {
        return Buffer.from(result.imageBase64, "base64");
      }

      lastDiagnostic = result.diagnostic;

      if (result.isDefiniteRefusal || attempt === MAX_ATTEMPTS) {
        break;
      }

      await sleep(RETRY_DELAY_MS * attempt);
    }

    throw new Error(`Etch: Gemini returned no image data for prompt "${prompt}" (${lastDiagnostic}).`);
  }
}
