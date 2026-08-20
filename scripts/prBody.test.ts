import { describe, expect, it } from "vitest";
import type { RunPipelineResult } from "./queue.ts";
import { buildPrBody } from "./prBody.ts";

const illustratedResult: RunPipelineResult = {
  theme: "Fantasy Castles",
  category: "Seasonal Coloring Books",
  contentType: "illustrated",
  batchId: "fantasy-castles",
  stage: "listed",
  selectionRationale: "Fake rationale.",
  remainingQueueLength: 0,
};

const textResult: RunPipelineResult = {
  theme: "Autumn Reflections",
  category: "Poetry Collections",
  contentType: "text",
  batchId: "autumn-reflections",
  stage: "assembled",
  selectionRationale: "Fake rationale.",
  remainingQueueLength: 0,
  writer: { excerpt: "A fake representative excerpt.", wordCount: 4200, sectionCount: 15 },
};

describe("buildPrBody", () => {
  it("describes the illustrated pipeline and mentions interior.pdf/cover-art.png/listing.json", () => {
    const body = buildPrBody(illustratedResult);
    expect(body).toContain("Seasonal Coloring Books");
    expect(body).toContain("Loom generated prompts");
    expect(body).toContain("interior.pdf");
    expect(body).toContain("cover-art.png");
    expect(body).toContain("listing.json");
    expect(body).toContain("images/");
    expect(body).not.toContain("text-only");
  });

  it("describes the text-only pipeline, surfaces the Writer excerpt, and flags the missing listing", () => {
    const body = buildPrBody(textResult);
    expect(body).toContain("Poetry Collections");
    expect(body).toContain("Writer generated the full manuscript");
    expect(body).toContain("read it closely");
    expect(body).toContain("A fake representative excerpt.");
    expect(body).toContain("15-section");
    expect(body).toContain("4200-word");
    expect(body).toContain("does not yet have a KDP listing");
    expect(body).toContain("manuscript.md");
    expect(body).not.toContain("cover-art.png");
  });

  it("never mentions cover-art or images/ for a text-only batch, since neither exists", () => {
    const body = buildPrBody(textResult);
    expect(body).not.toContain("images/");
  });
});
