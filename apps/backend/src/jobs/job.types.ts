import type { EngineeringReport } from "../ai/report/report.types.js";
import type { ResolvedRepository } from "../github/github.client.js";
import type { RepositoryInfo } from "../types/repository-info.js";
import type { JobLogger } from "../logger/logger.service.js";
import type {
  AnalysisProgress,
  AnalysisStage,
} from "../progress/progress.types.js";

export type JobStatus = "running" | "completed" | "failed";

export interface JobResult {
  report: EngineeringReport;
  markdown: string;
  repository: RepositoryInfo;
  /** When the analysis ran (ISO 8601). Older than now for cached results. */
  analyzedAt: string;
  /** True when this result was reused from the cache. */
  cached: boolean;
}

/**
 * Where the repository for a job comes from.
 */
export type AnalysisSource =
  | { type: "upload"; zipPath: string; fileName: string }
  | { type: "github"; repository: ResolvedRepository };

/**
 * Same shape as the HTTP error responses, so the frontend
 * handles synchronous and background failures identically.
 */
export interface JobError {
  status: number;
  body: {
    success: false;
    error: string;
    message: string;
    [key: string]: unknown;
  };
}

export interface Job {
  id: string;
  status: JobStatus;
  progress: AnalysisProgress;
  result?: JobResult;
  error?: JobError;
  createdAt: number;
  updatedAt: number;
}

/**
 * What the analysis pipeline sees of its job: a way to report
 * progress and a logger scoped to this job only.
 */
export interface JobContext {
  readonly id: string;
  readonly logger: JobLogger;
  setStage(stage: AnalysisStage): void;
}
