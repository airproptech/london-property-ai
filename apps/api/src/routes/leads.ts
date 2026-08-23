import type { FastifyInstance } from "fastify";
import { eq, desc } from "drizzle-orm";
import { getDb, schema } from "@lpai/database";
import { CreateLeadInput } from "@lpai/shared";

export async function leadsRoutes(app: FastifyInstance) {
  const auth = { preHandler: [(app as any).authenticate] };

  app.get("/leads", auth, async (_request, reply) => {
    const db = getDb();
    const rows = await db.select().from(schema.leads).orderBy(desc(schema.leads.createdAt)).limit(100);
    return reply.send({ leads: rows });
  });

  app.get("/leads/:id", auth, async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();
    const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, id));
    if (!lead) return reply.code(404).send({ error: "Lead not found" });
    return reply.send({ lead });
  });

  app.get("/leads/:id/timeline", auth, async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();
    const activities = await db
      .select()
      .from(schema.activities)
      .where(eq(schema.activities.leadId, id))
      .orderBy(desc(schema.activities.createdAt));
    return reply.send({ activities });
  });

  // Ingestion endpoint — used by website forms and similar sources.
  // Webhook-specific ingestion (WhatsApp, email replies) lives under /webhooks
  // once those adapters are implemented in a later phase.
  app.post("/leads", async (request, reply) => {
    const parsed = CreateLeadInput.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid request body", details: parsed.error.flatten() });
    }

    const db = getDb();
    const [lead] = await db.insert(schema.leads).values(parsed.data).returning();

    if (!lead) {
      return reply.code(500).send({ error: "Failed to create lead" });
    }

    await db.insert(schema.activities).values({
      leadId: lead.id,
      activityType: "lead_created",
      metadata: { source: lead.source },
    });

    return reply.code(201).send({ lead });
  });
}
