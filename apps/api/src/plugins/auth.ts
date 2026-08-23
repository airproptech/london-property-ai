import type { FastifyInstance } from "fastify";
import fastifyJwt from "@fastify/jwt";
import argon2 from "argon2";
import { config } from "../config/index.js";

/**
 * Registers JWT support on the Fastify instance and exposes password
 * hashing helpers. Single-user auth for now (owner role only) — designed
 * so multi-user support can be added later without changing the token
 * shape (role is already in the payload).
 */
export async function registerAuth(app: FastifyInstance) {
  await app.register(fastifyJwt, {
    secret: config.jwt.accessSecret(),
    sign: { expiresIn: config.jwt.accessTtl },
  });

  app.decorate("authenticate", async (request: any, reply: any) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.code(401).send({ error: "Unauthorized" });
    }
  });
}

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  return argon2.verify(hash, plain);
}
