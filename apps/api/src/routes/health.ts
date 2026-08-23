import type { FastifyInstance } from "fastify";
import { getDb } from "@lpai/database";
import { sql } from "drizzle-orm";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async (_request, reply) => {
    try {
      const db = getDb();
      await db.execute(sql`SELECT 1`);
      return reply.send({ status: "ok", database: "connected", timestamp: new Date().toISOString() });
    } catch (err) {
      app.log.error(err, "Health check failed");
      return reply.code(503).send({
        status: "degraded",
        database: "disconnected",
        timestamp: new Date().toISOString(),
      });
    }
  });
}
