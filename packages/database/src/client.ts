import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

/**
 * Returns a singleton Drizzle client bound to DATABASE_URL.
 * Throws loudly if the env var is missing rather than silently
 * connecting to nothing — this is a database credential, never
 * default to a guessed connection string.
 */
export function getDb() {
  if (_db) return _db;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and configure it."
    );
  }

  const client = postgres(connectionString, { max: 10 });
  _db = drizzle(client, { schema });
  return _db;
}

export * as schema from "./schema.js";
export type Database = ReturnType<typeof getDb>;
