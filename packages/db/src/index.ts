import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export * from "./schema";
export { schema };

const globalForDb = globalThis as unknown as {
  __accountingSql?: ReturnType<typeof postgres>;
};

function getConnectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and configure it.");
  }
  return url;
}

// Reuse a single postgres client across hot reloads in dev.
const client =
  globalForDb.__accountingSql ??
  postgres(getConnectionString(), {
    max: Number(process.env.DB_POOL_MAX ?? 10),
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__accountingSql = client;
}

export const db = drizzle(client, { schema });
export type Database = typeof db;

/** Low-level client, exposed for migrations / graceful shutdown. */
export const sqlClient = client;
