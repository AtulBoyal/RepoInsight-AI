import fs from "node:fs/promises";
import { Router, type Response } from "express";

import { upload } from "../http/multer.js";
import { analysisRateLimits } from "../http/rate-limit.js";
import { runAnalysisJob } from "../application/analysis-job.runner.js";
import { jobStore } from "../jobs/job.store.js";
import { env } from "../config/env.js";
import { parseGitHubUrl } from "../github/github-url.js";
import { resolveRepository } from "../github/github.client.js";

const router = Router();

function isBusy(): boolean {
  return jobStore.runningCount() >= env.MAX_CONCURRENT_JOBS;
}

function sendBusy(res: Response) {
  return res.status(429).json({
    success: false,
    error: "SERVER_BUSY",
    message:
      "The server is busy with other analyses. Please try again in a minute.",
  });
}

/**
 * Accepts a ZIP upload and starts a background analysis job.
 *
 * Rate limits are checked before the upload is received.
 * Responds immediately with 202 and a job id. Progress and the final
 * report are delivered by GET /api/jobs/:id/events (Server-Sent Events).
 */
router.post(
  "/analyze",
  ...analysisRateLimits,
  upload.single("repository"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "NO_FILE",
        message: "No ZIP file uploaded.",
      });
    }

    if (isBusy()) {
      await fs.rm(req.file.path, { force: true });

      return sendBusy(res);
    }

    const job = jobStore.create();

    void runAnalysisJob(job.id, {
      type: "upload",
      zipPath: req.file.path,
      fileName: req.file.originalname,
    });

    return res.status(202).json({
      success: true,
      jobId: job.id,
    });
  },
);

/**
 * Starts a background analysis of a public GitHub repository.
 * Body: { "url": "https://github.com/owner/repo" }
 *
 * The URL is checked and the repository looked up on GitHub before the
 * job is created, so mistakes (typos, private repositories) are reported
 * immediately and do not count toward the rate limit. The download
 * itself happens inside the job.
 */
router.post(
  "/analyze/github",
  ...analysisRateLimits,
  async (req, res) => {
    const url: unknown = req.body?.url;

    if (typeof url !== "string") {
      return res.status(400).json({
        success: false,
        error: "INVALID_GITHUB_URL",
        message: 'Send a JSON body like { "url": "https://github.com/owner/repo" }.',
      });
    }

    if (isBusy()) {
      return sendBusy(res);
    }

    // Throws GitHubError, which the error handler turns into JSON.
    const repository = await resolveRepository(parseGitHubUrl(url));

    const job = jobStore.create();

    void runAnalysisJob(job.id, { type: "github", repository });

    return res.status(202).json({
      success: true,
      jobId: job.id,
      repository: {
        name: repository.fullName,
        commitSha: repository.commitSha,
      },
    });
  },
);

export default router;
