/**
 * Schema statements, run in order at startup. Each must be safe to run
 * again (IF NOT EXISTS), because they run on every start.
 */
export const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS reports (
    id UUID PRIMARY KEY,
    -- Analysis version + input (GitHub commit or ZIP SHA-256)
    cache_key TEXT NOT NULL UNIQUE,
    report JSONB NOT NULL,
    repository JSONB NOT NULL,
    analyzed_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    -- Public link id, set only after the user clicks Share
    share_id TEXT UNIQUE,
    -- SHA-256 of the secret given to the browser that shared it
    owner_token_hash TEXT,
    shared_at TIMESTAMPTZ
  )`,
  `CREATE INDEX IF NOT EXISTS reports_expires_at_idx ON reports (expires_at)`,
];
