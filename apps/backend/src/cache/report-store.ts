import type { JobResult } from "../jobs/job.types.js";

/**
 * Where finished reports are kept for reuse: in memory by default, or in
 * Postgres (PostgresReportStore) when DATABASE_URL is set.
 */
export interface ReportStore {
  get(key: string): Promise<JobResult | undefined>;
  /**
   * Saves (or replaces) the report for this key. Returns the saved
   * report's id when it can be shared, otherwise undefined.
   */
  set(key: string, result: JobResult): Promise<string | undefined>;
}

interface Entry {
  result: JobResult;
  expiresAt: number;
}

/**
 * Least-recently-used cache in process memory, with a time limit per
 * entry. Cleared when the server restarts (or sleeps on Render's free
 * plan).
 */
export class MemoryReportStore implements ReportStore {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly maxEntries: number,
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  async get(key: string): Promise<JobResult | undefined> {
    const entry = this.entries.get(key);

    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }

    // Map keeps insertion order: re-insert to mark as recently used.
    this.entries.delete(key);
    this.entries.set(key, entry);

    return entry.result;
  }

  async set(key: string, result: JobResult): Promise<undefined> {
    if (this.maxEntries <= 0) {
      return undefined;
    }

    this.entries.delete(key);
    this.entries.set(key, { result, expiresAt: this.now() + this.ttlMs });

    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value as string;
      this.entries.delete(oldest);
    }

    // Reports in memory cannot be shared (they vanish on restart).
    return undefined;
  }

  get size(): number {
    return this.entries.size;
  }
}
