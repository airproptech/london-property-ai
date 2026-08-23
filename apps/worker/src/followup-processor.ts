import { eq, and, lte, isNull, or } from "drizzle-orm";
import { getDb, schema } from "@lpai/database";
import { CommunicationService, EmailAdapter, WhatsAppAdapter } from "@lpai/communications";
import { checkCompliance } from "./compliance.js";

const communicationService = new CommunicationService();
communicationService.register(
  new EmailAdapter(process.env.RESEND_API_KEY ?? "", process.env.EMAIL_FROM_ADDRESS ?? "")
);
communicationService.register(
  new WhatsAppAdapter(
    process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
    process.env.WHATSAPP_ACCESS_TOKEN ?? "",
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? ""
  )
);

/**
 * Finds every follow-up due now, runs it through the compliance gate,
 * and either sends it or marks it skipped with a logged reason.
 * This is the only place that turns a scheduled followup row into an
 * actual outbound message — no other code path should send follow-ups.
 */
export async function processDueFollowups() {
  const db = getDb();
  const now = new Date();

  const due = await db
    .select({
      followup: schema.followups,
      lead: schema.leads,
    })
    .from(schema.followups)
    .innerJoin(schema.leads, eq(schema.followups.leadId, schema.leads.id))
    .where(and(eq(schema.followups.status, "pending"), lte(schema.followups.scheduledDate, now)));

  for (const { followup, lead } of due) {
    const compliance = checkCompliance({
      marketingOptIn: lead.marketingOptIn,
      status: lead.status,
      lastContactAt: lead.lastContactAt,
      now,
    });

    if (!compliance.allowed) {
      await db
        .update(schema.followups)
        .set({ status: "skipped", response: compliance.reason, completedAt: now })
        .where(eq(schema.followups.id, followup.id));
      continue;
    }

    const recipient = resolveRecipient(followup.channel, lead);
    if (!recipient) {
      await db
        .update(schema.followups)
        .set({ status: "failed", response: "No contact address for this channel", completedAt: now })
        .where(eq(schema.followups.id, followup.id));
      continue;
    }

    try {
      await communicationService.send(followup.channel as any, {
        to: recipient,
        body: followup.messageDraft ?? "",
      });

      await db
        .update(schema.followups)
        .set({ status: "sent", completedAt: now })
        .where(eq(schema.followups.id, followup.id));

      await db.insert(schema.activities).values({
        leadId: lead.id,
        activityType: `${followup.channel}_message_sent`,
        metadata: { followupId: followup.id, purpose: followup.purpose },
      });

      await db
        .update(schema.leads)
        .set({ lastContactAt: now })
        .where(eq(schema.leads.id, lead.id));
    } catch (err) {
      // Adapters are stubs until Phase 7 — this will fail until real
      // credentials + implementations exist. Logged, not swallowed.
      await db
        .update(schema.followups)
        .set({
          status: "failed",
          response: err instanceof Error ? err.message : String(err),
          completedAt: now,
        })
        .where(eq(schema.followups.id, followup.id));
    }
  }

  return { processed: due.length };
}

function resolveRecipient(channel: string, lead: typeof schema.leads.$inferSelect): string | null {
  switch (channel) {
    case "email":
      return lead.email ?? null;
    case "whatsapp":
      return lead.whatsappNumber ?? null;
    case "sms":
      return lead.phone ?? null;
    default:
      return null;
  }
}
