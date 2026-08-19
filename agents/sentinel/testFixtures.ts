import type { Diagnosis, SentinelClient } from "./claudeClient.ts";

/** Test-only fixture: a fake Sentinel client so tests never need ANTHROPIC_API_KEY or a real network call. */
export function fakeSentinelClient(diagnosis: Partial<Diagnosis> = {}): SentinelClient {
  const resolved: Diagnosis = {
    summary: "Fix fake failure",
    diagnosis: "Fake diagnosis for testing.",
    confidentFix: false,
    patch: "",
    ...diagnosis,
  };
  return {
    diagnose: async () => resolved,
  };
}
