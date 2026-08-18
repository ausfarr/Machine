import { GoogleGenAI } from "@google/genai";

/**
 * Etch's one authorized external API call (see CLAUDE.md's "Authorized
 * external APIs" section). Every image produced here is disclosed in the
 * batch manifest as AI-generated (images.source === "etch").
 */

const DEFAULT_MODEL = "gemini-2.5-flash-image";

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

export class GeminiImageClient implements ImageGenClient {
  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor(options: { apiKey?: string; model?: string } = {}) {
    this.client = new GoogleGenAI({ apiKey: options.apiKey ?? requireApiKey() });
    this.model = options.model ?? process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
  }

  async generateImage(prompt: string): Promise<Buffer> {
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: prompt,
    });

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((part) => part.inlineData?.data);

    if (!imagePart?.inlineData?.data) {
      throw new Error(`Etch: Gemini returned no image data for prompt: "${prompt}"`);
    }

    return Buffer.from(imagePart.inlineData.data, "base64");
  }
}
