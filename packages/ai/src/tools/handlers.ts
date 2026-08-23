import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { getDb, schema } from "@lpai/database";
import { computeMatch, type MatchableLeadPreferences, type MatchableProperty } from "@lpai/property-matching";

/**
 * Every function here is what the AI agent's tool calls actually invoke.
 * Each does its own validation/permission-scoping — the agent cannot
 * bypass these to run arbitrary queries. Keep these narrow and specific;
 * resist the temptation to add a generic "run_query" tool.
 */

export async function getLead(leadId: string) {
  const db = getDb();
  const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, leadId));
  if (!lead) throw new Error(`Lead ${leadId} not found`);
  return lead;
}

export async function updateLead(
  leadId: string,
  fields: Partial<{
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    preferredContactMethod: string;
    status: string;
  }>
) {
  const db = getDb();
  await db
    .update(schema.leads)
    .set({ ...fields, updatedAt: sql`now()` })
    .where(eq(schema.leads.id, leadId));
  return getLead(leadId);
}

export async function getLeadPreferences(leadId: string) {
  const db = getDb();
  const [prefs] = await db
    .select()
    .from(schema.leadPreferences)
    .where(eq(schema.leadPreferences.leadId, leadId));
  return prefs ?? null;
}

export async function updateLeadPreferences(leadId: string, fields: Record<string, unknown>) {
  const db = getDb();
  const existing = await getLeadPreferences(leadId);

  if (existing) {
    await db
      .update(schema.leadPreferences)
      .set({ ...fields, updatedAt: sql`now()` })
      .where(eq(schema.leadPreferences.leadId, leadId));
  } else {
    await db.insert(schema.leadPreferences).values({ leadId, ...fields });
  }
  return getLeadPreferences(leadId);
}

export async function searchProperties(filters: {
  londonArea?: string;
  priceMin?: number;
  priceMax?: number;
  bedrooms?: number;
  propertyType?: string;
}) {
  const db = getDb();
  const conditions = [eq(schema.properties.status, "available")];

  if (filters.londonArea) conditions.push(eq(schema.properties.londonArea, filters.londonArea));
  if (filters.bedrooms !== undefined) conditions.push(eq(schema.properties.bedrooms, filters.bedrooms));
  if (filters.propertyType) conditions.push(eq(schema.properties.propertyType, filters.propertyType));
  if (filters.priceMin !== undefined) conditions.push(gte(schema.properties.price, String(filters.priceMin)));
  if (filters.priceMax !== undefined) conditions.push(lte(schema.properties.price, String(filters.priceMax)));

  return db
    .select()
    .from(schema.properties)
    .where(and(...conditions))
    .limit(25);
}

export async function matchProperties(leadId: string) {
  const db = getDb();
  const prefs = await getLeadPreferences(leadId);
  if (!prefs) {
    throw new Error(`No preferences recorded yet for lead ${leadId} — cannot match.`);
  }

  const availableProperties = await db
    .select()
    .from(schema.properties)
    .where(eq(schema.properties.status, "available"))
    .limit(200);

  const matchablePrefs: MatchableLeadPreferences = {
    budgetMin: prefs.budgetMin ? Number(prefs.budgetMin) : null,
    budgetMax: prefs.budgetMax ? Number(prefs.budgetMax) : null,
    preferredLocations: prefs.preferredLocations,
    propertyTypes: prefs.propertyTypes,
    bedroomsMin: prefs.bedroomsMin,
    bedroomsMax: prefs.bedroomsMax,
    minimumLeaseLength: prefs.minimumLeaseLength,
    desiredRoiPercent: prefs.desiredRoiPercent ? Number(prefs.desiredRoiPercent) : null,
    acceptableServiceCharge: prefs.acceptableServiceCharge ? Number(prefs.acceptableServiceCharge) : null,
    investmentOrResidential: prefs.investmentOrResidential as MatchableLeadPreferences["investmentOrResidential"],
  };

  const results = availableProperties.map((property) => {
    const matchableProperty: MatchableProperty = {
      price: property.price ? Number(property.price) : null,
      londonArea: property.londonArea,
      propertyType: property.propertyType,
      bedrooms: property.bedrooms,
      leaseLengthYears: property.leaseLengthYears,
      serviceCharge: property.serviceCharge ? Number(property.serviceCharge) : null,
      annualRentalIncome: property.annualRentalIncome ? Number(property.annualRentalIncome) : null,
      estimatedYieldPercent: property.estimatedYieldPercent ? Number(property.estimatedYieldPercent) : null,
    };
    const { score, explanation } = computeMatch(matchablePrefs, matchableProperty);
    return { property, score, explanation };
  });

  // Persist top matches so they're auditable, not just ephemeral AI output.
  const topMatches = results.sort((a, b) => b.score - a.score).slice(0, 10);
  for (const m of topMatches) {
    await db
      .insert(schema.leadPropertyMatches)
      .values({
        leadId,
        propertyId: m.property.id,
        matchScore: m.score,
        reasonsForMatch: m.explanation,
      })
      .onConflictDoUpdate({
        target: [schema.leadPropertyMatches.leadId, schema.leadPropertyMatches.propertyId],
        set: { matchScore: m.score, reasonsForMatch: m.explanation, dateMatched: sql`now()` },
      });
  }

  return topMatches;
}

export async function createFollowup(input: {
  leadId: string;
  scheduledDate: string;
  channel: string;
  purpose: string;
  messageDraft?: string;
}) {
  const db = getDb();
  const [row] = await db
    .insert(schema.followups)
    .values({
      leadId: input.leadId,
      scheduledDate: new Date(input.scheduledDate),
      channel: input.channel,
      purpose: input.purpose,
      messageDraft: input.messageDraft,
    })
    .returning();

  if (!row) {
    throw new Error("Failed to create followup — insert returned no row");
  }
  return row;
}

export async function cancelFollowup(followupId: string) {
  const db = getDb();
  await db
    .update(schema.followups)
    .set({ status: "cancelled" })
    .where(eq(schema.followups.id, followupId));
  return { followupId, status: "cancelled" };
}

export async function getConversationHistory(leadId: string, limit = 20) {
  const db = getDb();
  return db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.leadId, leadId))
    .orderBy(desc(schema.conversations.createdAt))
    .limit(limit);
}

export async function createAppointment(input: {
  leadId: string;
  propertyId?: string;
  type: string;
  scheduledAt: string;
  notes?: string;
}) {
  const db = getDb();
  const [row] = await db
    .insert(schema.appointments)
    .values({
      leadId: input.leadId,
      propertyId: input.propertyId,
      type: input.type,
      scheduledAt: new Date(input.scheduledAt),
      notes: input.notes,
    })
    .returning();

  if (!row) {
    throw new Error("Failed to create appointment — insert returned no row");
  }

  await db.insert(schema.activities).values({
    leadId: input.leadId,
    activityType: "appointment_booked",
    metadata: { appointmentId: row.id, type: input.type },
  });

  return row;
}

/**
 * notify_human does NOT send anything itself — it assembles the structured
 * notification payload and hands it to whichever notify channel is
 * configured (email/Telegram/Slack). Actual delivery lives in the worker
 * or API's notification service (Phase 6), kept separate so this stays
 * a pure, testable data-assembly function.
 */
export async function notifyHuman(input: { leadId: string; reason: string; recommendedNextAction: string }) {
  const db = getDb();
  const lead = await getLead(input.leadId);
  const prefs = await getLeadPreferences(input.leadId);
  const recentConversation = await getConversationHistory(input.leadId, 1);

  const payload = {
    lead: `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim() || lead.id,
    budget:
      prefs?.budgetMin || prefs?.budgetMax
        ? `£${prefs.budgetMin ?? "?"} - £${prefs.budgetMax ?? "?"}`
        : "unknown",
    location: prefs?.preferredLocations?.join(", ") ?? "unknown",
    purchaseTimeline: prefs?.desiredCompletion ?? "unknown",
    leadScore: lead.leadScore,
    reason: input.reason,
    lastMessage: recentConversation[0]?.messageText ?? "(none)",
    recommendedNextAction: input.recommendedNextAction,
  };

  await db.insert(schema.activities).values({
    leadId: input.leadId,
    activityType: "human_escalation_triggered",
    metadata: payload,
  });

  // Actual delivery (email/Telegram/Slack) is wired in the worker's
  // notification dispatcher — this function's job ends at producing
  // the structured payload above.
  return payload;
}
