import { describe, expect, it } from "vitest";
import { interpretGenerateContentResponse } from "./geminiClient.ts";

describe("interpretGenerateContentResponse", () => {
  it("returns the image data when Gemini includes an inline image part", () => {
    const result = interpretGenerateContentResponse({
      candidates: [{ content: { parts: [{ inlineData: { data: "abc123" } }] }, finishReason: "STOP" }],
    });
    expect(result.imageBase64).toBe("abc123");
  });

  it("flags a promptFeedback.blockReason as a definite refusal, not a transient error", () => {
    const result = interpretGenerateContentResponse({
      candidates: [{ content: { parts: [] } }],
      promptFeedback: { blockReason: "SAFETY" },
    });
    expect(result.imageBase64).toBeUndefined();
    expect(result.isDefiniteRefusal).toBe(true);
    expect(result.diagnostic).toMatch(/blockReason=SAFETY/);
  });

  it("flags a non-STOP finishReason as a definite refusal", () => {
    const result = interpretGenerateContentResponse({
      candidates: [{ content: { parts: [] }, finishReason: "PROHIBITED_CONTENT" }],
    });
    expect(result.isDefiniteRefusal).toBe(true);
    expect(result.diagnostic).toMatch(/finishReason=PROHIBITED_CONTENT/);
  });

  it("surfaces Gemini's own explanatory text when present", () => {
    const result = interpretGenerateContentResponse({
      candidates: [{ content: { parts: [{ text: "I can't create images of that." }] }, finishReason: "STOP" }],
    });
    expect(result.isDefiniteRefusal).toBe(true);
    expect(result.diagnostic).toMatch(/Gemini said: "I can't create images of that\."/);
  });

  it("treats a genuinely empty response with no signal as a transient (retryable) case", () => {
    const result = interpretGenerateContentResponse({ candidates: [{ content: { parts: [] }, finishReason: "STOP" }] });
    expect(result.isDefiniteRefusal).toBe(false);
    expect(result.diagnostic).toMatch(/transient API issue/);
  });
});
