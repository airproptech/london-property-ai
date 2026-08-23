import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { config } from "./config.js";
import { processDueFollowups } from "./followup-processor.js";

const connection = new Redis(config.redisUrl(), { maxRetriesPerRequest: null });

const QUEUE_NAME = "followup-scheduler";

async function main() {
  const queue = new Queue(QUEUE_NAME, { connection });

  // Repeatable job — ticks every pollIntervalMs to check for due follow-ups.
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

  console.log(`[worker] Started. Polling every ${config.pollIntervalMs}ms.`);
}

main().catch((err) => {
  console.error("[worker] Fatal error on startup:", err);
  process.exit(1);
});
