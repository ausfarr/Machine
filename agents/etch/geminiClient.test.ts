import { describe, expect, it } from "vitest";
import { interpretGenerateContentResponse, isRetryableApiError } from "./geminiClient.ts";

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

describe("isRetryableApiError", () => {
  it("retries a 503 (the reported real-world failure: 'Deadline expired before operation could complete')", () => {
    const err = new Error(
      'got status: 503 Service Unavailable. {"error":{"code":503,"message":"Deadline expired before operation could complete.","status":"UNAVAILABLE"}}'
    );
    expect(isRetryableApiError(err)).toBe(true);
  });

  it("retries any 5xx status", () => {
    expect(isRetryableApiError(new Error("got status: 500 Internal Server Error. {}"))).toBe(true);
  });

  it("retries 429 (rate limited)", () => {
    expect(isRetryableApiError(new Error("got status: 429 Too Many Requests. {}"))).toBe(true);
  });

  it("does not retry a 400 (bad request) — it would fail identically every time", () => {
    expect(isRetryableApiError(new Error("got status: 400 Bad Request. {}"))).toBe(false);
  });

  it("does not retry a 401/403 (auth failures)", () => {
    expect(isRetryableApiError(new Error("got status: 401 Unauthorized. {}"))).toBe(false);
    expect(isRetryableApiError(new Error("got status: 403 Forbidden. {}"))).toBe(false);
  });

  it("treats an error with no parseable status as transient", () => {
    expect(isRetryableApiError(new Error("fetch failed: ECONNRESET"))).toBe(true);
  });
});
