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

  it("throws a specific error naming the raw offending value when the field can't be recovered at all", () => {
    const message = fakeMessage("report_candidate_themes", { themes: "Cozy Cabins, not an array or JSON" });
    expect(() => parseToolResult(message, "report_candidate_themes", CandidateThemesSchema, ["themes"])).toThrow(
      /didn't match the expected shape.*Raw value\(s\) that failed recovery: themes="Cozy Cabins, not an array or JSON"/s
    );
  });

  it("recovers when an array-typed field is itself a JSON-encoded string, instead of failing", () => {
    // Regression test: a real failure had Claude return { themes: '["Cozy Cabins", "Fantasy Castles"]' }
    // — a JSON-encoded array *string* nested inside the (correctly parsed) outer object.
    const message = fakeMessage("report_candidate_themes", { themes: JSON.stringify(["Cozy Cabins", "Fantasy Castles"]) });
    const result = parseToolResult(message, "report_candidate_themes", CandidateThemesSchema, ["themes"]);
    expect(result.themes).toEqual(["Cozy Cabins", "Fantasy Castles"]);
  });

  it("recovers a plain newline-delimited list, not just JSON-encoded arrays", () => {
    // Regression test: a real failure persisted after JSON-recovery landed because
    // Claude returned a plain "\n"-joined list, not JSON array syntax.
    const message = fakeMessage("report_candidate_themes", { themes: "Cozy Cabins\nFantasy Castles\nCoastal Cabins, Nordic Style" });
    const result = parseToolResult(message, "report_candidate_themes", CandidateThemesSchema, ["themes"]);
    expect(result.themes).toEqual(["Cozy Cabins", "Fantasy Castles", "Coastal Cabins, Nordic Style"]);
  });

  it("strips list markers (-, *, 1.) when recovering a newline-delimited list", () => {
    const message = fakeMessage("report_candidate_themes", { themes: "1. Cozy Cabins\n2. Fantasy Castles\n- Woodland Creatures" });
    const result = parseToolResult(message, "report_candidate_themes", CandidateThemesSchema, ["themes"]);
    expect(result.themes).toEqual(["Cozy Cabins", "Fantasy Castles", "Woodland Creatures"]);
  });

  it("recovers a semicolon-delimited list when there's no newline", () => {
    const message = fakeMessage("report_candidate_themes", { themes: "Cozy Cabins; Fantasy Castles; Woodland Creatures" });
    const result = parseToolResult(message, "report_candidate_themes", CandidateThemesSchema, ["themes"]);
    expect(result.themes).toEqual(["Cozy Cabins", "Fantasy Castles", "Woodland Creatures"]);
  });

  it("does not split a single item on a bare comma, since a theme can legitimately contain one", () => {
    const message = fakeMessage("report_candidate_themes", { themes: "Coastal Cabins, Nordic Style" });
    expect(() => parseToolResult(message, "report_candidate_themes", CandidateThemesSchema, ["themes"])).toThrow(
      /didn't match the expected shape/
    );
  });

  it("does not attempt array-field recovery unless the field is named in arrayFields", () => {
    const message = fakeMessage("report_candidate_themes", { themes: JSON.stringify(["Cozy Cabins"]) });
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
