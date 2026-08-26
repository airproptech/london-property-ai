import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Resolves relative to this file's own location, not the caller's cwd —
// so this works whether invoked as `npm run migrate` from packages/database,
// via `npx tsx packages/database/src/migrate.ts` from the repo root, or
// from inside a Docker container with a different working directory.
const MIGRATIONS_FOLDER = path.resolve(__dirname, "../../../migrations");

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set.");
  }
  const migrationClient = postgres(connectionString, { max: 1 });
  const db = drizzle(migrationClient);
  console.log(`Running migrations from ${MIGRATIONS_FOLDER} ...`);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  console.log("Migrations complete.");
  await migrationClient.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
