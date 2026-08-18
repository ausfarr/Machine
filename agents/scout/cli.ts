import { runScout } from "./index.ts";

const theme = process.argv.slice(2).join(" ").trim();

if (!theme) {
  console.error('usage: npm run scout -- "a rough theme or category"');
  process.exit(1);
}

try {
  const result = runScout(theme);
  console.log(`Scout: created batch "${result.batchId}" at stage "researched"`);
  console.log(`  ${result.researchJsonPath}`);
  console.log(`  ${result.researchMdPath}`);
  console.log(`  ${result.batchDir}/manifest.json`);
  console.log("A human should review the report before greenlighting this theme for Loom.");
} catch (err) {
  console.error("Scout failed:", err instanceof Error ? err.message : err);
  process.exit(1);
}
