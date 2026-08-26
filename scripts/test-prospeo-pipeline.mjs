import { getDb, schema } from "@lpai/database";
import {
  discoverAndFilter,
  qualifyProspect,
  enrichProspect,
  promoteToLead,
} from "@lpai/lead-discovery";
import { eq } from "drizzle-orm";

async function main() {
  const db = getDb();

  console.log("\n=== 1. Seeding a test Prospeo account ===");
  const [account] = await db
    .insert(schema.prospeoAccounts)
    .values({
      accountName: "test-mock-account",
      apiKeyEnvVar: "PROSPEO_API_KEY_ACCOUNT_A", // value irrelevant under MOCK_PROSPEO=true
      active: true,
      remainingCredits: 100,
      monthlyLimit: 100,
    })
    .returning();
  console.log("Account:", account.accountName, account.id);

  console.log("\n=== 2. Discover + filter + dedupe (mock provider) ===");
  const discoverResult = await discoverAndFilter(account.id, "unused-in-mock", {
    jobTitles: ["Investor"],
    countries: ["United Kingdom"],
    industries: ["Real Estate"],
    limit: 5,
  });
  console.log("Discovered:", discoverResult);

  const prospects = await db
    .select()
    .from(schema.prospeoProspects)
    .where(eq(schema.prospeoProspects.sourceAccountId, account.id));
  console.log(`Found ${prospects.length} prospects in DB.`);

  console.log("\n=== 3. Qualify each prospect (deterministic stub scorer) ===");
  for (const p of prospects) {
    await qualifyProspect(p.id, async (prospect) => ({
      score: 75, // fixed score for this test — real scoring wired in later
      reasoning: "Test stub: fixed score for pipeline validation.",
      qualification: "good",
      model: "test-stub",
    }));
  }

  const ready = await db
    .select()
    .from(schema.prospeoProspects)
    .where(eq(schema.prospeoProspects.status, "ready_for_enrichment"));
  console.log(`${ready.length} prospect(s) ready_for_enrichment.`);

  console.log("\n=== 4. Enrich the top-ranked prospect ===");
  const top = ready[0];
  if (!top) {
    console.log("No prospect reached ready_for_enrichment — stopping here.");
    return;
  }
  await enrichProspect(top.id);

  const [enriched] = await db
    .select()
    .from(schema.prospeoProspects)
    .where(eq(schema.prospeoProspects.id, top.id));
  console.log("Enrichment result:", {
    status: enriched.status,
    email: enriched.email,
    emailStatus: enriched.emailStatus,
  });

  if (enriched.status !== "enriched") {
    console.log("Prospect did not reach 'enriched' status — stopping before promotion.");
    return;
  }

  console.log("\n=== 5. Promote to a real lead ===");
  const leadId = await promoteToLead(enriched.id);
  const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, leadId));
  console.log("Promoted lead:", lead);

  console.log("\n=== Pipeline test complete ===");
}

main()
  .catch((err) => {
    console.error("Pipeline test failed:", err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
