// Run a full sync from the command line: npm run sync
// Loads .env / .env.local so it works outside Next.js.
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const { runSync } = await import("../lib/sync");
  console.log("Starting HubSpot sync...");
  const result = await runSync();
  console.log("Sync complete:", JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error("Sync failed:", err);
  process.exit(1);
});
