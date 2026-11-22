import fs from "node:fs/promises";
import { Router } from "express";

import { upload } from "../http/multer.js";
import { runAnalysisJob } from "../application/analysis-job.runner.js";
import { jobStore } from "../jobs/job.store.js";
import { env } from "../config/env.js";

const router = Router();

/**
 * Accepts a ZIP upload and starts a background analysis job.
 *
 * Responds immediately with 202 and a job id. Progress and the final
 * report are delivered by GET /api/jobs/:id/events (Server-Sent Events).
 */
router.post(
  "/analyze",
  upload.single("repository"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "NO_FILE",
        message: "No ZIP file uploaded.",
      });
    }

    if (jobStore.runningCount() >= env.MAX_CONCURRENT_JOBS) {
      await fs.rm(req.file.path, { force: true });

      return res.status(429).json({
        success: false,
        error: "SERVER_BUSY",
        message:
          "The server is busy with other analyses. Please try again in a minute.",
      });
    }

    const job = jobStore.create();

    void runAnalysisJob(job.id, req.file.path);

    return res.status(202).json({
      success: true,
      jobId: job.id,
    });
  },
);

export default router;
