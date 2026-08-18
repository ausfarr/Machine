import { readFileSync } from "node:fs";
import { validateManifest } from "../schemas/manifest.ts";

const path = process.argv[2];
if (!path) {
  console.error("usage: npm run validate:manifest -- <path-to-manifest.json>");
  process.exit(1);
}

const raw = readFileSync(path, "utf-8");
const data = JSON.parse(raw);

try {
  const manifest = validateManifest(data);
  console.log(`OK: ${path} is a valid manifest at stage "${manifest.stage}"`);
} catch (err) {
  console.error(`INVALID: ${path}`);
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
