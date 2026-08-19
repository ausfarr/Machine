import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { parseDiagnosis } from "./claudeClient.ts";

function fakeMessage(input: unknown): Anthropic.Message {
  return {
    content: [{ type: "tool_use", id: "toolu_1", name: "report_diagnosis", input }],
  } as unknown as Anthropic.Message;
}

describe("parseDiagnosis", () => {
  it("returns the validated diagnosis when the tool call matches the schema", () => {
    const message = fakeMessage({
      summary: "Fix off-by-one in slug.ts",
      diagnosis: "The loop bound was wrong.",
      confidentFix: true,
      patch: "diff --git a/x b/x\n",
    });
    const result = parseDiagnosis(message);
    expect(result.summary).toBe("Fix off-by-one in slug.ts");
    expect(result.confidentFix).toBe(true);
  });

  it("accepts confidentFix: false with an empty patch", () => {
    const message = fakeMessage({
      summary: "Investigate flaky test",
      diagnosis: "Not enough context to propose a fix confidently.",
      confidentFix: false,
      patch: "",
    });
    expect(() => parseDiagnosis(message)).not.toThrow();
  });

  it("rejects confidentFix: true with an empty patch, rather than silently accepting a fix with nothing to apply", () => {
    const message = fakeMessage({
      summary: "Fix something",
      diagnosis: "...",
      confidentFix: true,
      patch: "",
    });
    expect(() => parseDiagnosis(message)).toThrow(/confidentFix is true but patch is empty/);
  });

  it("throws when Claude doesn't return the expected tool call", () => {
    const message = { content: [{ type: "text", text: "no tool call" }] } as unknown as Anthropic.Message;
    expect(() => parseDiagnosis(message)).toThrow(/did not return a diagnosis tool call/);
  });

  it("parses a stringified JSON input instead of returning the raw string", () => {
    const message = fakeMessage(
      JSON.stringify({ summary: "s", diagnosis: "d", confidentFix: false, patch: "" })
    );
    const result = parseDiagnosis(message);
    expect(result.summary).toBe("s");
  });
});
