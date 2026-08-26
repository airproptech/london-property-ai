import { eq, and, lte, isNull, or } from "drizzle-orm";
import { getDb, schema } from "@lpai/database";
import { CommunicationService, createEmailProvider } from "@lpai/communications";
import type { CommunicationAdapter, SendMessageInput, SendMessageResult } from "@lpai/communications";
import { BaileysWhatsAppAdapter } from "./whatsapp/baileys-adapter.js";
import { checkCompliance } from "./compliance.js";

/**
 * Thin adapter bridging the EmailProvider interface (richer, tracking-aware)
 * onto the simpler CommunicationAdapter interface the follow-up processor
 * and AI agent tools expect. Real tracking (opens/clicks/campaign
 * attribution) happens through the dedicated email_events pipeline in
 * Phase 11 — this bridge covers plain one-off sends like follow-ups.
 */
class EmailAdapterBridge implements CommunicationAdapter {
  readonly channel = "email" as const;
  constructor(private readonly provider: ReturnType<typeof createEmailProvider>) {}

  async send(input: SendMessageInput): Promise<SendMessageResult> {
    const result = await this.provider.send({
      to: input.to,
      subject: input.subject ?? "Message from London Property AI",
      html: input.body,
      text: input.body,
    });
    return { providerMessageId: result.providerMessageId, raw: result.raw };
  }

  verifyWebhookSignature(rawBody: string | Buffer, headers: Record<string, string>): boolean {
    return this.provider.verifyWebhookSignature(rawBody, headers);
  }
}

const communicationService = new CommunicationService();
communicationService.register(new EmailAdapterBridge(createEmailProvider()));
communicationService.register(new BaileysWhatsAppAdapter());

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
