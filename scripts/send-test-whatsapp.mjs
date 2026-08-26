// Enqueues a one-off WhatsApp test send, processed by the running worker
// process (which holds the live Baileys connection) — this script itself
// only talks to Redis, never to WhatsApp directly, so it can't conflict
// with the worker's active session.
//
// Run with: TEST_WHATSAPP_TO=18706962412 TEST_WHATSAPP_TEXT="hello" node scripts/send-test-whatsapp.mjs
// (TEST_WHATSAPP_TO can be your own number, or the linked business number
// itself, to send yourself a message via WhatsApp's "Message Yourself" thread)

import { Queue } from "bullmq";
import { Redis } from "ioredis";

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  throw new Error("REDIS_URL is not set.");
}

const to = process.env.TEST_WHATSAPP_TO;
const text = process.env.TEST_WHATSAPP_TEXT ?? "This is a live test message from the WhatsApp/Baileys integration.";

if (!to) {
  throw new Error("TEST_WHATSAPP_TO is not set — provide a phone number, digits only, e.g. 18706962412");
}

const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
const queue = new Queue("manual-test-send", { connection });

const job = await queue.add("test-send", { to, text });
console.log(`Enqueued test send job ${job.id} — check 'docker compose logs worker' for the result.`);

await queue.close();
await connection.quit();
