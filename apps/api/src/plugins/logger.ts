import { config } from "../config/index.js";

/** Pino transport config, passed directly into Fastify's `logger` option. */
export const loggerOptions =
  config.nodeEnv === "development"
    ? {
        level: config.logLevel,
        transport: {
          target: "pino-pretty",
          options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" },
        },
      }
    : {
        level: config.logLevel,
        // Production: structured JSON to stdout, no pretty-printing —
        // this is what gets shipped to log aggregation later.
      };
