import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { processNextQueuedTheme, readQueue, writeQueue } from "./queue.ts";

let tempDir: string | undefined;

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("readQueue / writeQueue", () => {
  it("returns an empty array when the queue file doesn't exist", () => {
    tempDir = mkdtempSync(join(tmpdir(), "queue-test-"));
    expect(readQueue(join(tempDir, "theme-queue.json"))).toEqual([]);
  });

  it("round-trips a written queue", () => {
    tempDir = mkdtempSync(join(tmpdir(), "queue-test-"));
    const queuePath = join(tempDir, "theme-queue.json");
    writeQueue(queuePath, ["Fantasy Castles", "Cozy Cabins"]);
    expect(readQueue(queuePath)).toEqual(["Fantasy Castles", "Cozy Cabins"]);
  });

  it("throws on a malformed queue file instead of silently ignoring it", () => {
    tempDir = mkdtempSync(join(tmpdir(), "queue-test-"));
    const queuePath = join(tempDir, "theme-queue.json");
    writeFileSync(queuePath, JSON.stringify({ not: "an array" }));
    expect(() => readQueue(queuePath)).toThrow(/must be a JSON array/);
  });
});

describe("processNextQueuedTheme", () => {
  it("reports processed:false on an empty queue instead of fabricating a batch", () => {
    tempDir = mkdtempSync(join(tmpdir(), "queue-test-"));
    const result = processNextQueuedTheme({
      queuePath: join(tempDir, "theme-queue.json"),
      batchesDir: join(tempDir, "batches"),
    });
    expect(result.processed).toBe(false);
  });

  it("pops the first theme, runs Scout+Loom on it, and rewrites the queue", () => {
    tempDir = mkdtempSync(join(tmpdir(), "queue-test-"));
    const queuePath = join(tempDir, "theme-queue.json");
    const batchesDir = join(tempDir, "batches");
    writeQueue(queuePath, ["Fantasy Castles", "Cozy Cabins"]);

    const result = processNextQueuedTheme({ queuePath, batchesDir });

    expect(result.processed).toBe(true);
    if (!result.processed) throw new Error("unreachable");
    expect(result.theme).toBe("Fantasy Castles");
    expect(result.stage).toBe("prompted");
    expect(result.remainingQueueLength).toBe(1);

    const remainingQueue = JSON.parse(readFileSync(queuePath, "utf-8"));
    expect(remainingQueue).toEqual(["Cozy Cabins"]);

    const manifest = JSON.parse(readFileSync(join(batchesDir, result.batchId, "manifest.json"), "utf-8"));
    expect(manifest.stage).toBe("prompted");
  });
});
