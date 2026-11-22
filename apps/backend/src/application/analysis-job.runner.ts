import { analyzeUploadedRepository } from "./repository-analysis.service.js";
import { jobStore } from "../jobs/job.store.js";
import { JobLogger } from "../logger/logger.service.js";
import { toErrorResponse } from "../http/error-response.js";

import type { JobContext } from "../jobs/job.types.js";

/**
 * Runs one analysis job in the background and records the outcome
 * in the job store. Never throws: every failure becomes a failed job.
 */
export async function runAnalysisJob(
  jobId: string,
  zipFilePath: string,
): Promise<void> {
  const logger = new JobLogger(jobId);

  const context: JobContext = {
    id: jobId,
    logger,
    setStage: (stage) => jobStore.setStage(jobId, stage),
  };

  try {
    await logger.info("Repository analysis started");

    const result = await analyzeUploadedRepository(zipFilePath, context);

    jobStore.complete(jobId, {
      report: result.report,
      markdown: result.markdown,
    });

    await logger.info("Repository analysis completed", result.trace);
  } catch (error) {
    await logger.error("Repository analysis failed", error);

    jobStore.fail(jobId, toErrorResponse(error));
  }
}
