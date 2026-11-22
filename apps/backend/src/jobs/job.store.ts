import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";

import { ANALYSIS_PROGRESS } from "../progress/progress.constants.js";
import type { AnalysisStage } from "../progress/progress.types.js";
import type { Job, JobError, JobResult } from "./job.types.js";

/**
 * Finished jobs (and their reports) are kept this long so the
 * client can reconnect and still receive the result.
 */
const FINISHED_JOB_TTL_MS = 30 * 60 * 1000;

const SWEEP_INTERVAL_MS = 60 * 1000;

/**
 * In-memory store of analysis jobs.
 *
 * Each job has its own progress, result and error, so concurrent
 * analyses never see each other's state. Listeners are notified on
 * every change (used by the Server-Sent Events route).
 *
 * Single-process only: jobs are lost on restart. Swap for Redis or a
 * database when persistence or multiple instances are needed.
 */
class JobStore {
  private readonly jobs = new Map<string, Job>();

  private readonly events = new EventEmitter();

  constructor() {
    this.events.setMaxListeners(0);

    setInterval(() => this.sweep(), SWEEP_INTERVAL_MS).unref();
  }

  create(): Job {
    const now = Date.now();

    const job: Job = {
      id: randomUUID(),
      status: "running",
      progress: { ...ANALYSIS_PROGRESS.UPLOADING, updatedAt: now },
      createdAt: now,
      updatedAt: now,
    };

    this.jobs.set(job.id, job);

    return job;
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  runningCount(): number {
    let count = 0;

    for (const job of this.jobs.values()) {
      if (job.status === "running") count++;
    }

    return count;
  }

  setStage(id: string, stage: AnalysisStage): void {
    this.update(id, (job) => {
      job.progress = { ...ANALYSIS_PROGRESS[stage], updatedAt: Date.now() };
    });
  }

  complete(id: string, result: JobResult): void {
    this.update(id, (job) => {
      job.status = "completed";
      job.result = result;
      job.progress = { ...ANALYSIS_PROGRESS.COMPLETED, updatedAt: Date.now() };
    });
  }

  fail(id: string, error: JobError): void {
    this.update(id, (job) => {
      job.status = "failed";
      job.error = error;
      job.progress = { ...ANALYSIS_PROGRESS.FAILED, updatedAt: Date.now() };
    });
  }

  /**
   * Calls `listener` on every change to the job.
   * Returns an unsubscribe function.
   */
  subscribe(id: string, listener: (job: Job) => void): () => void {
    this.events.on(id, listener);

    return () => {
      this.events.off(id, listener);
    };
  }

  private update(id: string, mutate: (job: Job) => void): void {
    const job = this.jobs.get(id);

    if (!job || job.status !== "running") {
      return;
    }

    mutate(job);

    job.updatedAt = Date.now();

    this.events.emit(id, job);
  }

  private sweep(): void {
    const cutoff = Date.now() - FINISHED_JOB_TTL_MS;

    for (const [id, job] of this.jobs) {
      if (job.status !== "running" && job.updatedAt < cutoff) {
        this.jobs.delete(id);
      }
    }
  }
}

export const jobStore = new JobStore();
