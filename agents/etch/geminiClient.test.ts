import { describe, expect, it } from "vitest";
import { interpretGenerateImagesResponse, isRetryableApiError } from "./geminiClient.ts";

describe("interpretGenerateImagesResponse", () => {
  it("returns the image data when Imagen includes generated image bytes", () => {
    const result = interpretGenerateImagesResponse({
      generatedImages: [{ image: { imageBytes: "abc123" } }],
    });
    expect(result.imageBase64).toBe("abc123");
  });

  it("flags a raiFilteredReason as a definite refusal, not a transient error", () => {
    // Regression test: the general-purpose chat model (generateContent) could
    // respond with prose instead of an image ("Here are your whimsical
    // cottagecore mushroom cottages..."); generateImages's response type has
    // no text field, so that failure mode can't happen here at all — the
    // only "declined" shape is a filtered result with a reason attached.
    const result = interpretGenerateImagesResponse({
      generatedImages: [{ raiFilteredReason: "Blocked due to safety guidelines." }],
    });
    expect(result.imageBase64).toBeUndefined();
    expect(result.isDefiniteRefusal).toBe(true);
    expect(result.diagnostic).toMatch(/raiFilteredReason=Blocked due to safety guidelines\./);
  });

  it("treats a genuinely empty response with no signal as a transient (retryable) case", () => {
    const result = interpretGenerateImagesResponse({ generatedImages: [] });
    expect(result.isDefiniteRefusal).toBe(false);
    expect(result.diagnostic).toMatch(/transient API issue/);
  });

  it("treats a response with no generatedImages field at all as transient", () => {
    const result = interpretGenerateImagesResponse({});
    expect(result.isDefiniteRefusal).toBe(false);
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
