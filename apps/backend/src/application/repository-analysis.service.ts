import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { processRepository } from "../repository/repository-processor.service.js";
import { progressService } from "../progress/progress.service.js";
import { analyzeRepository } from "../ai/analysis/ai-analysis.service.js";

import type { AnalysisResult } from "../ai/analysis/analysis.types.js";

/**
 * Runs the full analysis for an uploaded ZIP.
 *
 * The uploaded ZIP and the extracted files are always deleted
 * afterwards, whether the analysis succeeds or fails.
 */
export async function analyzeUploadedRepository(
  zipFilePath: string,
): Promise<AnalysisResult> {
  const extractionDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "repository-"),
  );

  try {
    const metadata = await processRepository(
      zipFilePath,
      extractionDirectory,
    );

    const result = await analyzeRepository({
      metadata,
    });

    progressService.setStage("COMPLETED");

    return result;
  } catch (error) {
    progressService.setStage("FAILED");

    throw error;
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
