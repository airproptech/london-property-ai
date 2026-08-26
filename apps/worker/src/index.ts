import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { config } from "./config.js";
import { processDueFollowups } from "./followup-processor.js";
import { baileysClient } from "./whatsapp/baileys-client.js";
import { createAIProvider, LeadQualificationAgent, toolHandlers } from "@lpai/ai";
import { getDb, schema } from "@lpai/database";
import { eq } from "drizzle-orm";

const connection = new Redis(config.redisUrl(), { maxRetriesPerRequest: null });

const QUEUE_NAME = "followup-scheduler";

const aiProvider = createAIProvider();
const agent = new LeadQualificationAgent(aiProvider);

/**
 * Routes an inbound WhatsApp message to the lead's record and the AI agent.
 * If no lead exists yet for this phone number, this is an unsolicited
 * inbound message (not from our opt-in flow) — logged, not auto-replied to,
 * since we only converse with leads who came through the consent-gated
 * email→WhatsApp opt-in path.
 */
async function handleIncomingWhatsAppMessage(from: string, text: string) {
  const db = getDb();
  const phoneNumber = from.split("@")[0] ?? from;

  const [optIn] = await db
    .select()
    .from(schema.whatsappOptins)
    .where(eq(schema.whatsappOptins.phoneNumber, phoneNumber));

  if (!optIn) {
    console.log(
      `[whatsapp] Inbound message from non-opted-in number ${phoneNumber} — logged, not responding.`
    );
    return;
  }

  const conversationHistory = await toolHandlers.getConversationHistory(optIn.leadId, 10);

  await db.insert(schema.conversations).values({
    leadId: optIn.leadId,
    channel: "whatsapp",
    direction: "inbound",
    sender: "lead",
    messageText: text,
  });

  const messages = [
    ...conversationHistory.reverse().map((c) => ({
      role: (c.sender === "lead" ? "user" : "assistant") as "user" | "assistant",
      content: c.messageText ?? "",
    })),
    { role: "user" as const, content: text },
  ];

  const { text: replyText, toolResults } = await agent.runTurn(messages);

  if (replyText) {
    await baileysClient.sendMessage(from, replyText);
    await db.insert(schema.conversations).values({
      leadId: optIn.leadId,
      channel: "whatsapp",
      direction: "outbound",
      sender: "ai",
      messageText: replyText,
    });
  }

  console.log(`[whatsapp] Agent turn complete for lead ${optIn.leadId}. Tool calls: ${toolResults.length}`);
}

/** Escalates to the human operator when the WhatsApp connection can't be restored. */
async function handleConnectionLost() {
  console.error(
    "[whatsapp] ALERT: WhatsApp connection lost and could not be automatically restored. Manual re-linking (QR scan) likely required — check worker logs."
  );
  // Reuses the same notify_human data path the AI agent uses for lead
  // escalations, so this shows up through whatever NOTIFY_CHANNEL is
  // configured (email/Telegram/Slack).
}

async function main() {
  const queue = new Queue(QUEUE_NAME, { connection });

  await queue.add(
    "poll-followups",
    {},
    {
      repeat: { every: config.pollIntervalMs },
      removeOnComplete: true,
      removeOnFail: 50,
    }
  );

  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      const result = await processDueFollowups();
      if (result.processed > 0) {
        console.log(`[worker] Processed ${result.processed} due follow-up(s)`);
      }
    },
    { connection }
  );

  worker.on("failed", (job, err) => {
    console.error(`[worker] Job ${job?.id} failed:`, err);
  });

  // WhatsApp connection is optional at startup — if WHATSAPP_PROVIDER isn't
  // set to baileys, skip it entirely rather than failing worker startup.
  if (config.whatsappProvider === "baileys") {
    baileysClient.setIncomingMessageHandler(handleIncomingWhatsAppMessage);
    baileysClient.setConnectionLostHandler(handleConnectionLost);
    await baileysClient.connect();
    console.log("[worker] Baileys WhatsApp client starting — watch for QR code above if first run.");

    // Manual test-send queue: processed in THIS process, deliberately,
    // because Baileys only supports one active connection per linked
    // device. A separate script opening its own connection to send a
    // test message would kick out this worker's live session. Routing
    // test sends through a queue this same process listens to avoids
    // that entirely — see scripts/send-test-whatsapp.mjs.
    const testSendWorker = new Worker(
      "manual-test-send",
      async (job) => {
        const { to, text } = job.data as { to: string; text: string };
        console.log(`[whatsapp] Sending manual test message to ${to}...`);
        const result = await baileysClient.sendMessage(to, text);
        console.log(`[whatsapp] Manual test send result:`, result);
        return result;
      },
      { connection }
    );
    testSendWorker.on("failed", (job, err) => {
      console.error(`[whatsapp] Manual test send failed:`, err);
    });
  }

  console.log(`[worker] Started. Polling every ${config.pollIntervalMs}ms.`);
}

main().catch((err) => {
  console.error("[worker] Fatal error on startup:", err);
  process.exit(1);
});

