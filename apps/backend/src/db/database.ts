import pg from "pg";

import { env } from "../config/env.js";
import { MIGRATIONS } from "./migrations.js";

/**
 * The small part of a Postgres client the app needs. Implemented by a
 * `pg` connection pool in production and by PGlite in tests.
 */
export interface Database {
  query<Row = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: Row[]; rowCount: number }>;
  close(): Promise<void>;
}

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

let database: Database | undefined;
let cleanupTimer: NodeJS.Timeout | undefined;

export function createPostgresDatabase(connectionString: string): Database {
  const pool = new pg.Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  // An idle client losing its connection (e.g. Neon scaling to zero)
  // must not crash the server; the pool reconnects on the next query.
  pool.on("error", (error) => {
    console.error("Postgres pool error:", error.message);
  });

  return {
    async query<Row>(text: string, params?: unknown[]) {
      const result = await pool.query(text, params);

      return { rows: result.rows as Row[], rowCount: result.rowCount ?? 0 };
    },
    close: () => pool.end(),
  };
}

/**
 * Creates the tables (idempotent) and removes expired reports.
 */
export async function migrate(db: Database): Promise<void> {
  for (const statement of MIGRATIONS) {
    await db.query(statement);
  }
}

export async function deleteExpiredReports(db: Database): Promise<number> {
  const result = await db.query("DELETE FROM reports WHERE expires_at <= now()");

  return result.rowCount;
}

/**
 * Connects to DATABASE_URL (if set), creates the tables and starts the
 * hourly cleanup of expired reports. Throws if the database is set but
 * unreachable, so a wrong connection string is noticed at startup.
 *
 * Without DATABASE_URL the app still works: reports are cached in
 * memory only and sharing is unavailable.
 */
export async function initDatabase(): Promise<Database | undefined> {
  if (!env.DATABASE_URL) {
    return undefined;
  }

  const db = createPostgresDatabase(env.DATABASE_URL);

  await migrate(db);
  await deleteExpiredReports(db);

  setDatabase(db);

  cleanupTimer = setInterval(() => {
    deleteExpiredReports(db).catch((error: unknown) => {
      console.error("Failed to delete expired reports:", error);
    });
  }, CLEANUP_INTERVAL_MS);
  cleanupTimer.unref();

  return db;
}

export function getDatabase(): Database | undefined {
  return database;
}

/**
 * Sets the active database (used at startup, and by tests).
 */
export function setDatabase(db: Database | undefined): void {
  database = db;
}
