import { existsSync } from "node:fs";
import { normalize, relative } from "node:path";

const MAX_FILES = 5;

/** tsc: "agents/foo/bar.ts(12,5): error TS2345: ..." */
const TSC_PATTERN = /([\w./-]+\.tsx?)\((\d+),\d+\)/g;
/** Node/Vitest stack frames: "at ... (/abs/or/relative/agents/foo/bar.test.ts:34:10)" */
const STACK_PATTERN = /([\w./-]+\.tsx?):(\d+):\d+/g;

/**
 * Pulls candidate source-file paths out of a raw CI failure log (tsc
 * output, a Vitest stack trace, or similar), so Sentinel can hand Claude
 * the actual files involved instead of just the error text. Only paths
 * that exist on disk and fall inside the repo are kept — a log can
 * reference node_modules internals or a path that no longer exists,
 * neither of which Sentinel should try to read or patch.
 */
export function extractCandidateFiles(log: string, repoRoot: string = process.cwd()): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  for (const pattern of [TSC_PATTERN, STACK_PATTERN]) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(log)) !== null) {
      const raw = match[1];
      if (!raw) continue;

      const rel = normalize(relative(repoRoot, raw.startsWith("/") ? raw : `${repoRoot}/${raw}`));
      if (rel.startsWith("..") || rel.includes("node_modules")) continue;
      if (seen.has(rel)) continue;

      if (!existsSync(`${repoRoot}/${rel}`)) continue;

      seen.add(rel);
      found.push(rel);
      if (found.length >= MAX_FILES) return found;
    }
  }

  return found;
}
