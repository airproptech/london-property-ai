import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@lpai/database";
import { SCORING_WEIGHTS, ScoringSignal, temperatureForScore } from "./config.js";

/**
 * Applies a scoring signal to a lead:
 *  1. Looks up the weight from config (never hard-coded here)
 *  2. Writes an explainable event row (lead_score_events)
 *  3. Atomically updates the lead's running score + temperature
 *
 * This is the ONLY path that should mutate leads.lead_score — never set it directly.
 */
export async function applyScoringSignal(
  leadId: string,
  signal: ScoringSignal,
  reasonOverride?: string
) {
  const db = getDb();
  const delta = SCORING_WEIGHTS[signal];
  const reason = reasonOverride ?? humanizeSignal(signal, delta);

  return db.transaction(async (tx) => {
    const [lead] = await tx
      .select({ leadScore: schema.leads.leadScore })
      .from(schema.leads)
      .where(eq(schema.leads.id, leadId));

    if (!lead) {
      throw new Error(`Lead ${leadId} not found`);
    }

    const newScore = Math.max(0, Math.min(100, lead.leadScore + delta));
    const newTemperature = temperatureForScore(newScore);

    await tx.insert(schema.leadScoreEvents).values({
      leadId,
      delta,
      reason,
      resultingScore: newScore,
    });

    await tx
      .update(schema.leads)
      .set({
        leadScore: newScore,
        temperature: newTemperature,
        updatedAt: sql`now()`,
      })
      .where(eq(schema.leads.id, leadId));

    return { newScore, newTemperature, delta, reason };
  });
}

/** Returns the full explainable score history for a lead, most recent first. */
export async function getScoreHistory(leadId: string) {
  const db = getDb();
  return db
    .select()
    .from(schema.leadScoreEvents)
    .where(eq(schema.leadScoreEvents.leadId, leadId))
    .orderBy(sql`created_at DESC`);
}

function humanizeSignal(signal: ScoringSignal, delta: number): string {
  const labels: Record<ScoringSignal, string> = {
    budgetConfirmed: "budget confirmed",
    timelineWithin3Months: "purchase within 3 months",
    depositConfirmed: "deposit confirmed",
    specificLocationGiven: "specific London location given",
    financingReadinessConfirmed: "financing readiness confirmed",
    requestedPropertyDetails: "requested property details",
    requestedViewingOrAppointment: "requested viewing/appointment",
    engagedWithTwoPlusFollowups: "engaged with 2+ follow-ups",
    noResponseToTwoPlusFollowups: "no response to 2+ follow-ups",
    emailOpened: "email opened",
    propertyLinkClicked: "property link clicked",
    multiplePropertyClicks: "multiple property clicks (3+)",
    leadFormSubmitted: "lead form submitted",
    whatsappOptIn: "WhatsApp opt-in",
    viewingRequested: "viewing requested",
  };
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${delta} ${labels[signal]}`;
}
