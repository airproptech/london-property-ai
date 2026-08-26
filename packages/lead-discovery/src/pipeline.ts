import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@lpai/database";
import type { LeadProvider, LeadSearchParams, RawProspect } from "./provider.js";
import { isDuplicateProspect, isDuplicateEmail } from "./dedup.js";
import { reserveCredit } from "./credit-manager.js";
import { createLeadProvider } from "./provider-factory.js";

async function logEvent(prospectId: string, eventType: string, metadata?: Record<string, unknown>) {
  const db = getDb();
  await db.insert(schema.prospeoProspectEvents).values({ prospectId, eventType, metadata });
}

/**
 * Step 1-3: Discover, filter, and dedupe. Does NOT spend an enrichment
 * credit — search itself costs a Prospeo credit (per their pricing), but
 * that's unavoidable and already accounted for; this step's job is to
 * make sure we don't waste anything further downstream.
 */
export async function discoverAndFilter(
  accountId: string,
  apiKey: string,
  params: LeadSearchParams
): Promise<{ discovered: number; duplicates: number }> {
  const db = getDb();
  const provider = createLeadProvider(apiKey);

  const rawProspects = await provider.search(params);
  let discovered = 0;
  let duplicates = 0;

  for (const raw of rawProspects) {
    if (await isDuplicateProspect(raw)) {
      duplicates += 1;
      continue;
    }

    let companyId: string | null = null;
    if (raw.companyDomain || raw.companyName) {
      const [existingCompany] = raw.companyDomain
        ? await db.select().from(schema.companies).where(eq(schema.companies.domain, raw.companyDomain)).limit(1)
        : [];

      if (existingCompany) {
        companyId = existingCompany.id;
      } else {
        const [newCompany] = await db
          .insert(schema.companies)
          .values({
            companyName: raw.companyName ?? "Unknown",
            domain: raw.companyDomain,
            linkedinUrl: raw.companyLinkedinUrl,
            industry: raw.industry,
            companySize: raw.companySize,
            location: raw.location,
          })
          .returning();
        companyId = newCompany?.id ?? null;
      }
    }

    const [prospect] = await db
      .insert(schema.prospeoProspects)
      .values({
        firstName: raw.firstName,
        lastName: raw.lastName,
        fullName: raw.fullName,
        jobTitle: raw.jobTitle,
        companyId,
        linkedinUrl: raw.linkedinUrl,
        location: raw.location,
        country: raw.country,
        industry: raw.industry,
        companySize: raw.companySize,
        status: "discovered",
        sourceAccountId: accountId,
      })
      .returning();

    if (prospect) {
      await logEvent(prospect.id, "discovered", { providerRef: raw.providerRef });
      discovered += 1;
    }
  }

  return { discovered, duplicates };
}

/**
 * Step 4: AI qualification. Costs an AI call, not a Prospeo credit —
 * cheap enough to run on every non-duplicate discovered prospect.
 */
export async function qualifyProspect(
  prospectId: string,
  scoreFn: (prospect: typeof schema.prospeoProspects.$inferSelect) => Promise<{
    score: number;
    reasoning: string;
    qualification: string;
    model: string;
  }>
): Promise<void> {
  const db = getDb();
  const [prospect] = await db.select().from(schema.prospeoProspects).where(eq(schema.prospeoProspects.id, prospectId));
  if (!prospect) throw new Error(`Prospect ${prospectId} not found`);

  const result = await scoreFn(prospect);

  await db.insert(schema.prospeoProspectScores).values({
    prospectId,
    score: result.score,
    reasoning: result.reasoning,
    model: result.model,
    qualification: result.qualification,
  });

  const newStatus = result.score >= 31 ? "ready_for_enrichment" : "rejected";

  await db
    .update(schema.prospeoProspects)
    .set({ leadScore: result.score, qualification: result.qualification, status: newStatus, updatedAt: sql`now()` })
    .where(eq(schema.prospeoProspects.id, prospectId));

  await logEvent(prospectId, newStatus === "rejected" ? "rejected" : "qualified", { score: result.score });
}

/**
 * Steps 5-7: Rank (caller should query ready_for_enrichment ordered by
 * leadScore DESC), reserve a credit, and enrich. One prospect per call —
 * the caller loops over the ranked queue.
 */
export async function enrichProspect(prospectId: string): Promise<void> {
  const db = getDb();
  const [prospect] = await db.select().from(schema.prospeoProspects).where(eq(schema.prospeoProspects.id, prospectId));
  if (!prospect) throw new Error(`Prospect ${prospectId} not found`);

  if (prospect.status !== "ready_for_enrichment") {
    throw new Error(`Prospect ${prospectId} is not ready for enrichment (status: ${prospect.status})`);
  }

  let account;
  try {
    account = await reserveCredit();
  } catch (err) {
    await db
      .update(schema.prospeoProspects)
      .set({ status: "credit_unavailable", updatedAt: sql`now()` })
      .where(eq(schema.prospeoProspects.id, prospectId));
    await logEvent(prospectId, "enrichment_failed", { reason: "credit_unavailable" });
    return;
  }

  await db
    .update(schema.prospeoProspects)
    .set({ status: "enriching", updatedAt: sql`now()` })
    .where(eq(schema.prospeoProspects.id, prospectId));
  await logEvent(prospectId, "enrichment_started", { accountId: account.id });

  const apiKey = process.env[account.apiKeyEnvVar];
  if (!apiKey) {
    throw new Error(`Missing env var ${account.apiKeyEnvVar} for Prospeo account ${account.accountName}`);
  }
  const provider = createLeadProvider(apiKey);

  const [company] = prospect.companyId
    ? await db.select().from(schema.companies).where(eq(schema.companies.id, prospect.companyId))
    : [];

  const result = await provider.enrichEmail({
    firstName: prospect.firstName ?? undefined,
    lastName: prospect.lastName ?? undefined,
    companyDomain: company?.domain ?? undefined,
    companyName: company?.companyName ?? undefined,
  });

  if (!result.email) {
    await db
      .update(schema.prospeoProspects)
      .set({ status: "no_email", emailStatus: "not_found", enrichedAt: sql`now()`, updatedAt: sql`now()` })
      .where(eq(schema.prospeoProspects.id, prospectId));
    await logEvent(prospectId, "email_not_found");
    return;
  }

  if (await isDuplicateEmail(result.email)) {
    await db
      .update(schema.prospeoProspects)
      .set({ status: "duplicate", updatedAt: sql`now()` })
      .where(eq(schema.prospeoProspects.id, prospectId));
    await logEvent(prospectId, "duplicate", { email: result.email });
    return;
  }

  await db
    .update(schema.prospeoProspects)
    .set({
      email: result.email,
      emailStatus: result.emailStatus,
      status: "enriched",
      enrichedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(eq(schema.prospeoProspects.id, prospectId));

  await logEvent(prospectId, "email_found", { emailStatus: result.emailStatus });
}

/** Step 8: promote an enriched prospect into the real leads table. */
export async function promoteToLead(prospectId: string): Promise<string> {
  const db = getDb();
  const [prospect] = await db.select().from(schema.prospeoProspects).where(eq(schema.prospeoProspects.id, prospectId));
  if (!prospect) throw new Error(`Prospect ${prospectId} not found`);
  if (!prospect.email) throw new Error(`Prospect ${prospectId} has no email — cannot promote.`);

  const [lead] = await db
    .insert(schema.leads)
    .values({
      firstName: prospect.firstName,
      lastName: prospect.lastName,
      email: prospect.email,
      country: prospect.country,
      source: "prospeo",
      status: "new",
      marketingOptIn: false, // Cold-discovered — no consent yet; must be earned via the email nurture flow.
    })
    .returning();

  if (!lead) throw new Error("Failed to create lead from prospect");

  await db
    .update(schema.prospeoProspects)
    .set({ status: "ready_for_outreach", promotedLeadId: lead.id, updatedAt: sql`now()` })
    .where(eq(schema.prospeoProspects.id, prospectId));

  await logEvent(prospectId, "promoted_to_lead", { leadId: lead.id });

  return lead.id;
}
