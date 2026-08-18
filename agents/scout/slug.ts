import { existsSync } from "node:fs";
import { join } from "node:path";

export function slugify(theme: string): string {
  const slug = theme
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "untitled-batch";
}

/** Appends -2, -3, ... if the slug's batch folder already exists, so Scout never overwrites an existing batch. */
export function uniqueBatchId(theme: string, batchesDir: string): string {
  const base = slugify(theme);
  let candidate = base;
  let suffix = 2;
  while (existsSync(join(batchesDir, candidate))) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}
