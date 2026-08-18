import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { CandidateThemesSchema, parseToolResult } from "./claudeClient.ts";

function fakeMessage(toolName: string, input: unknown): Anthropic.Message {
  return {
    content: [{ type: "tool_use", id: "toolu_1", name: toolName, input }],
  } as unknown as Anthropic.Message;
}

describe("parseToolResult", () => {
  it("returns the validated data when the tool call input already matches the schema", () => {
    const message = fakeMessage("report_candidate_themes", { themes: ["Cozy Cabins", "Fantasy Castles"] });
    const result = parseToolResult(message, "report_candidate_themes", CandidateThemesSchema);
    expect(result.themes).toEqual(["Cozy Cabins", "Fantasy Castles"]);
  });

  it("parses a stringified JSON input instead of returning the raw string", () => {
    // Regression test: if a tool call's input ever arrives as a raw JSON
    // string instead of a parsed object, spreading it downstream (e.g.
    // [...candidates]) silently produces one array element per character.
    // parseToolResult must catch this here, not let it propagate.
    const message = fakeMessage("report_candidate_themes", JSON.stringify({ themes: ["Cozy Cabins"] }));
    const result = parseToolResult(message, "report_candidate_themes", CandidateThemesSchema);
    expect(result.themes).toEqual(["Cozy Cabins"]);
  });

  it("throws a specific error when the string input isn't valid JSON", () => {
    const message = fakeMessage("report_candidate_themes", "not json at all");
    expect(() => parseToolResult(message, "report_candidate_themes", CandidateThemesSchema)).toThrow(
      /isn't valid JSON/
    );
  });

  it("throws a specific error when the parsed input doesn't match the schema", () => {
    const message = fakeMessage("report_candidate_themes", { themes: "Cozy Cabins" });
    expect(() => parseToolResult(message, "report_candidate_themes", CandidateThemesSchema)).toThrow(
      /didn't match the expected shape/
    );
  });

  it("throws if no matching tool_use block is present", () => {
    const message = fakeMessage("some_other_tool", { themes: [] });
    expect(() => parseToolResult(message, "report_candidate_themes", CandidateThemesSchema)).toThrow(
      /did not return a "report_candidate_themes" tool call/
    );
  });
});
