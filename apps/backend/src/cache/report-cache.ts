import fs from "node:fs";
import { createHash } from "node:crypto";
import { pipeline } from "node:stream/promises";

import { env } from "../config/env.js";
import { jobStore } from "../jobs/job.store.js";
import type { JobResult } from "../jobs/job.types.js";
import { ANALYSIS_VERSION } from "./analysis-version.js";
import { MemoryReportStore, type ReportStore } from "./report-store.js";

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

  constructor(private readonly store: ReportStore) {}

  async lookup(key: string): Promise<JobResult | undefined> {
    return this.store.get(key);
  }

  async save(key: string, result: JobResult): Promise<void> {
    await this.store.set(key, result);
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

export const reportCache = new ReportCache(
  new MemoryReportStore(
    env.REPORT_CACHE_MAX_ENTRIES,
    env.REPORT_CACHE_TTL_HOURS * 60 * 60 * 1000,
  ),
);
