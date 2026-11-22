import type { JobResult } from "../jobs/job.types.js";

/**
 * Where finished reports are kept for reuse. The in-memory store below
 * is the default; a database-backed store can implement the same
 * interface later (e.g. for saved, shareable reports).
 */
export interface ReportStore {
  get(key: string): Promise<JobResult | undefined>;
  set(key: string, result: JobResult): Promise<void>;
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

  async set(key: string, result: JobResult): Promise<void> {
    if (this.maxEntries <= 0) {
      return;
    }

    this.entries.delete(key);
    this.entries.set(key, { result, expiresAt: this.now() + this.ttlMs });

    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value as string;
      this.entries.delete(oldest);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}
