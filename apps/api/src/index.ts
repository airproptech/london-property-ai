import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { config } from "./config/index.js";
import { loggerOptions } from "./plugins/logger.js";
import { registerAuth } from "./plugins/auth.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { leadsRoutes } from "./routes/leads.js";

async function main() {
  const app = Fastify({ logger: loggerOptions });

  await app.register(cors, {
    origin: [config.dashboardBaseUrl],
    credentials: true,
  });

  await app.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.window,
  });

  await registerAuth(app);

  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: "/api/v1" });
  await app.register(leadsRoutes, { prefix: "/api/v1" });

  app.setErrorHandler((error, request, reply) => {
    app.log.error(error);
    const statusCode = error.statusCode ?? 500;
    reply.code(statusCode).send({
      error: statusCode === 500 ? "Internal server error" : error.message,
    });
  });

  try {
    await app.listen({ port: config.port, host: "0.0.0.0" });
    app.log.info(`API listening on port ${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
