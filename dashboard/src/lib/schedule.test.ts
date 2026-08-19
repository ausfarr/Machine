import { describe, expect, it } from "vitest";
import { formatCountdown, nextScheduledRunAt } from "./schedule";

describe("nextScheduledRunAt", () => {
  it("returns later today when it's Monday before 13:00 UTC", () => {
    const now = new Date("2026-08-17T09:00:00Z"); // a Monday
    const next = nextScheduledRunAt(now);
    expect(next.toISOString()).toBe("2026-08-17T13:00:00.000Z");
  });

  it("rolls to next Monday when it's Monday after 13:00 UTC", () => {
    const now = new Date("2026-08-17T14:00:00Z"); // a Monday, past 13:00
    const next = nextScheduledRunAt(now);
    expect(next.toISOString()).toBe("2026-08-24T13:00:00.000Z");
  });

  it("finds the upcoming Monday from mid-week", () => {
    const now = new Date("2026-08-19T00:00:00Z"); // a Wednesday
    const next = nextScheduledRunAt(now);
    expect(next.toISOString()).toBe("2026-08-24T13:00:00.000Z");
  });

  it("finds the upcoming Monday from a Sunday", () => {
    const now = new Date("2026-08-23T23:00:00Z"); // a Sunday
    const next = nextScheduledRunAt(now);
    expect(next.toISOString()).toBe("2026-08-24T13:00:00.000Z");
  });

  it("lands exactly at 13:00:00.000 UTC on Monday when now is exactly that instant", () => {
    const now = new Date("2026-08-17T13:00:00Z");
    const next = nextScheduledRunAt(now);
    expect(next.toISOString()).toBe("2026-08-24T13:00:00.000Z");
  });
});

describe("formatCountdown", () => {
  const now = new Date("2026-08-19T00:00:00Z");

  it("reports minutes under an hour away", () => {
    expect(formatCountdown(new Date("2026-08-19T00:30:00Z"), now)).toBe("in ~30m");
  });

  it("reports hours under two days away", () => {
    expect(formatCountdown(new Date("2026-08-20T06:00:00Z"), now)).toBe("in ~30h");
  });

  it("reports days for anything further out", () => {
    expect(formatCountdown(new Date("2026-08-24T00:00:00Z"), now)).toBe("in ~5d");
  });

  it("reports due now for a past or current timestamp", () => {
    expect(formatCountdown(new Date("2026-08-18T00:00:00Z"), now)).toBe("due now");
    expect(formatCountdown(now, now)).toBe("due now");
  });
});
