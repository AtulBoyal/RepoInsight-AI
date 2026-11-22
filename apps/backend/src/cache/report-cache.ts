import fs from "node:fs";
import { createHash } from "node:crypto";
import { pipeline } from "node:stream/promises";

import { env } from "../config/env.js";
import { jobStore } from "../jobs/job.store.js";
import type { JobResult } from "../jobs/job.types.js";
import { ANALYSIS_VERSION } from "./analysis-version.js";
import { MemoryReportStore, type ReportStore } from "./report-store.js";
import { PostgresReportStore } from "./postgres-report-store.js";
import { getDatabase, type Database } from "../db/database.js";

/**
 * Cache key for a GitHub commit. The repository name is included so a
 * fork with the same commit still gets a report labelled with its name.
 */
export function githubCacheKey(fullName: string, commitSha: string): string {
  return `${ANALYSIS_VERSION}:github:${fullName.toLowerCase()}@${commitSha}`;
}

/**
 * Cache key for an uploaded ZIP: the SHA-256 of its bytes, so the same
 * archive uploaded again (by anyone) reuses the report.
 */
export async function uploadCacheKey(zipPath: string): Promise<string> {
  const hash = createHash("sha256");

  await pipeline(fs.createReadStream(zipPath), hash);

  return `${ANALYSIS_VERSION}:zip:${hash.digest("hex")}`;
}

/**
 * Reuses finished reports and joins identical analyses already running.
 */
export class ReportCache {
  private readonly inFlight = new Map<string, string>();

  /**
   * @param store returns the store to use now (resolved per call, so a
   *   database connected after startup, or in tests, is picked up).
   */
  constructor(private readonly store: () => ReportStore) {}

  /**
   * A stored report for this input, if any. A storage error is logged
   * and treated as "not cached", so a database outage does not stop
   * new analyses.
   */
  async lookup(key: string): Promise<JobResult | undefined> {
    try {
      return await this.store().get(key);
    } catch (error) {
      console.error("Report cache lookup failed:", error);
      return undefined;
    }
  }

  /**
   * Stores a finished report. Returns its id when it can be shared.
   * A storage error is logged and the report is simply not saved.
   */
  async save(key: string, result: JobResult): Promise<string | undefined> {
    try {
      return await this.store().set(key, result);
    } catch (error) {
      console.error("Saving report failed:", error);
      return undefined;
    }
  }

  /**
   * Id of a job already analyzing this input, if one is still running.
   */
  runningJob(key: string): string | undefined {
    const jobId = this.inFlight.get(key);

    if (jobId && jobStore.get(jobId)?.status === "running") {
      return jobId;
    }

    this.inFlight.delete(key);

    return undefined;
  }

  track(key: string, jobId: string): void {
    this.inFlight.set(key, jobId);
  }

  release(key: string, jobId: string): void {
    if (this.inFlight.get(key) === jobId) {
      this.inFlight.delete(key);
    }
  }
}

const memoryStore = new MemoryReportStore(
  env.REPORT_CACHE_MAX_ENTRIES,
  env.REPORT_CACHE_TTL_HOURS * 60 * 60 * 1000,
);

const postgresStores = new WeakMap<Database, PostgresReportStore>();

/**
 * Postgres when DATABASE_URL is configured, otherwise memory.
 */
function currentStore(): ReportStore {
  const db = getDatabase();

  if (!db) {
    return memoryStore;
  }

  let store = postgresStores.get(db);

  if (!store) {
    store = new PostgresReportStore(db, env.REPORT_RETENTION_DAYS);
    postgresStores.set(db, store);
  }

  return store;
}

export const reportCache = new ReportCache(currentStore);
