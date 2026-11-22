import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { analyzeUploadedRepository } from "./repository-analysis.service.js";
import { jobStore } from "../jobs/job.store.js";
import { JobLogger } from "../logger/logger.service.js";
import { toErrorResponse } from "../http/error-response.js";
import { downloadRepositoryZip } from "../github/github.client.js";
import { MAX_UPLOAD_SIZE } from "../constants/upload.js";
import { reportCache } from "../cache/report-cache.js";

import type { AnalysisSource, JobContext } from "../jobs/job.types.js";
import type { RepositoryInfo } from "../types/repository-info.js";

const DOWNLOAD_DIRECTORY = "tmp/uploads";

/**
 * Name shown in the report for an uploaded ZIP: its file name.
 */
function uploadName(fileName: string): string {
  const name = path.basename(fileName).replace(/\.zip$/i, "").trim();

  return (name || "repository").slice(0, 100);
}

/**
 * Gets the ZIP for a job: the uploaded file, or a fresh download
 * of the resolved GitHub commit.
 */
async function prepareSource(
  source: AnalysisSource,
  context: JobContext,
): Promise<{ zipPath: string; repository: RepositoryInfo }> {
  if (source.type === "upload") {
    return {
      zipPath: source.zipPath,
      repository: { name: uploadName(source.fileName) },
    };
  }

  context.setStage("DOWNLOADING");

  await fs.mkdir(DOWNLOAD_DIRECTORY, { recursive: true });

  const zipPath = path.join(DOWNLOAD_DIRECTORY, `${randomUUID()}.zip`);

  await downloadRepositoryZip(source.repository, zipPath, MAX_UPLOAD_SIZE);

  await context.logger.info("Repository downloaded from GitHub", {
    repository: source.repository.fullName,
    commit: source.repository.commitSha,
  });

  return {
    zipPath,
    repository: {
      name: source.repository.fullName,
      url: source.repository.htmlUrl,
      ref: source.repository.ref,
      commitSha: source.repository.commitSha,
    },
  };
}

export interface RunOptions {
  /** Store the result under this key for reuse. */
  cacheKey?: string;
}

/**
 * Runs one analysis job in the background and records the outcome
 * in the job store. Never throws: every failure becomes a failed job.
 */
export async function runAnalysisJob(
  jobId: string,
  source: AnalysisSource,
  options: RunOptions = {},
): Promise<void> {
  const logger = new JobLogger(jobId);

  const context: JobContext = {
    id: jobId,
    logger,
    setStage: (stage) => jobStore.setStage(jobId, stage),
  };

  try {
    await logger.info("Repository analysis started", { source: source.type });

    const { zipPath, repository } = await prepareSource(source, context);

    // Deletes the ZIP and extracted files when done.
    const result = await analyzeUploadedRepository(zipPath, context, repository);

    const jobResult = {
      report: result.report,
      markdown: result.markdown,
      repository,
      analyzedAt: new Date().toISOString(),
      cached: false,
    };

    if (options.cacheKey) {
      await reportCache.save(options.cacheKey, jobResult);
    }

    jobStore.complete(jobId, jobResult);

    await logger.info("Repository analysis completed", result.trace);
  } catch (error) {
    await logger.error("Repository analysis failed", error);

    jobStore.fail(jobId, toErrorResponse(error));
  } finally {
    if (options.cacheKey) {
      reportCache.release(options.cacheKey, jobId);
    }
  }
}
