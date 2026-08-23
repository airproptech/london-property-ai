import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@lpai/database";
import { verifyPassword } from "../plugins/auth.js";

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/login", async (request, reply) => {
    const parsed = LoginBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid request body", details: parsed.error.flatten() });
    }

    const { email, password } = parsed.data;
    const db = getDb();
    const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));

    if (!user) {
      // Deliberately generic error — don't reveal whether the email exists.
      return reply.code(401).send({ error: "Invalid credentials" });
    }

    const valid = await verifyPassword(user.passwordHash, password);
    if (!valid) {
      return reply.code(401).send({ error: "Invalid credentials" });
    }

    const token = app.jwt.sign({ userId: user.id, role: user.role, email: user.email });
    return reply.send({ token });
  });

  app.get("/auth/me", { preHandler: [(app as any).authenticate] }, async (request, reply) => {
    return reply.send({ user: request.user });
  });
}
