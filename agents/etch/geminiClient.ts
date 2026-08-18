import { GoogleGenAI } from "@google/genai";

/**
 * Etch's one authorized external API call (see CLAUDE.md's "Authorized
 * external APIs" section). Every image produced here is disclosed in the
 * batch manifest as AI-generated (images.source === "etch").
 *
 * Uses Gemini's dedicated Imagen image-generation endpoint
 * (`models.generateImages`), not the general-purpose multimodal chat
 * endpoint (`models.generateContent`). A chat-style model like
 * gemini-2.5-flash-image is free to respond with text instead of (or in
 * addition to) an image — in practice it sometimes just describes the
 * image in prose rather than drawing it. generateImages's response type
 * has no text field at all, so that failure mode is structurally
 * impossible here, not just less likely.
 */

const DEFAULT_MODEL = "imagen-3.0-generate-002";
/** Closest standard Imagen aspect ratio to an 8.5x11in portrait KDP page. */
const IMAGE_ASPECT_RATIO = "3:4";
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1500;

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

interface GeneratedImageLike {
  image?: { imageBytes?: string };
  raiFilteredReason?: string;
}

interface GenerateImagesResponseLike {
  generatedImages?: GeneratedImageLike[];
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
export function interpretGenerateImagesResponse(response: GenerateImagesResponseLike): InterpretedResponse {
  const first = response.generatedImages?.[0];

  if (first?.image?.imageBytes) {
    return { imageBase64: first.image.imageBytes, diagnostic: "", isDefiniteRefusal: false };
  }

  // Imagen's own responsible-AI filter — a deliberate refusal, most likely
  // because the prompt describes something sensitive (e.g. a vulnerable
  // population). Retrying the identical prompt won't change that outcome.
  if (first?.raiFilteredReason) {
    return { diagnostic: `raiFilteredReason=${first.raiFilteredReason}`, isDefiniteRefusal: true };
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
      let response: Awaited<ReturnType<typeof this.client.models.generateImages>>;
      try {
        response = await this.client.models.generateImages({
          model: this.model,
          prompt,
          config: { numberOfImages: 1, aspectRatio: IMAGE_ASPECT_RATIO, includeRaiReason: true },
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

      const result = interpretGenerateImagesResponse(response);
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
