import { afterEach, beforeEach, describe, expect, it } from "vitest";

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

beforeEach(() => {
  globalThis.localStorage = new MemoryStorage();
});

afterEach(() => {
  // @ts-expect-error -- test-only global stub cleanup.
  delete globalThis.localStorage;
});

describe("githubToken", () => {
  it("returns null when nothing is saved", async () => {
    const { getToken } = await import("./githubToken");
    expect(getToken()).toBeNull();
  });

  it("round-trips a saved token", async () => {
    const { getToken, setToken } = await import("./githubToken");
    setToken("github_pat_abc123");
    expect(getToken()).toBe("github_pat_abc123");
  });

  it("clears a saved token", async () => {
    const { clearToken, getToken, setToken } = await import("./githubToken");
    setToken("github_pat_abc123");
    clearToken();
    expect(getToken()).toBeNull();
  });

  it("masks a token down to its last 4 characters", async () => {
    const { maskToken } = await import("./githubToken");
    expect(maskToken("github_pat_11AAAA22ab12")).toBe("****ab12");
  });
});
