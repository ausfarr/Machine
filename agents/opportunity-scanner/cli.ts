import { runOpportunityScanner } from "./index.ts";

try {
  const result = await runOpportunityScanner();
  console.log(`Opportunity Scanner: selected "${result.category}" (${result.contentType}) for this week.`);
  console.log(`  ${result.reportJsonPath}`);
  console.log(`  ${result.reportMdPath}`);
} catch (err) {
  console.error("Opportunity Scanner failed:", err instanceof Error ? err.message : err);
  process.exit(1);
}
