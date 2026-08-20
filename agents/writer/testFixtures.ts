import type { Manuscript, WriterClient } from "./claudeClient.ts";

/** Test-only fixture: a fake client so tests never need ANTHROPIC_API_KEY or a real network call. */
export function fakeWriterClient(manuscript: Partial<Manuscript> = {}): WriterClient {
  const resolved: Manuscript = {
    sections: [
      { title: "Fake Section One", body: "This is fake body text for testing, long enough to count as real words." },
      { title: "Fake Section Two", body: "A second fake section with its own distinct fake body text for testing." },
    ],
    frontMatterDraft: "Fake front matter draft for testing.",
    backMatterDraft: "Fake back matter draft for testing.",
    ...manuscript,
  };
  return {
    generateManuscript: async () => resolved,
  };
}
