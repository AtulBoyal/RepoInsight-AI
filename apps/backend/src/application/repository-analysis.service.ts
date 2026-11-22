import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { processRepository } from "../repository/repository-processor.service.js";
import { analyzeRepository } from "../ai/analysis/ai-analysis.service.js";

import type { AnalysisResult } from "../ai/analysis/analysis.types.js";
import type { JobContext } from "../jobs/job.types.js";
import type { RepositoryInfo } from "../types/repository-info.js";

/**
 * Runs the full analysis for an uploaded ZIP.
 *
 * The uploaded ZIP and the extracted files are always deleted
 * afterwards, whether the analysis succeeds or fails.
 */
export async function analyzeUploadedRepository(
  zipFilePath: string,
  job: JobContext,
  repository: RepositoryInfo,
): Promise<AnalysisResult> {
  const extractionDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "repository-"),
  );

  try {
    const metadata = await processRepository(
      zipFilePath,
      extractionDirectory,
      job,
      repository.name,
    );

    return await analyzeRepository({ metadata, repository }, job);
  } finally {
    await Promise.allSettled([
      fs.rm(extractionDirectory, {
        recursive: true,
        force: true,
      }),
      fs.rm(zipFilePath, { force: true }),
    ]);
  }
}
