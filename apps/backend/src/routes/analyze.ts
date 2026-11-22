import fs from "node:fs/promises";
import { Router, type Response } from "express";

import { upload } from "../http/multer.js";
import { analysisRateLimits } from "../http/rate-limit.js";
import { runAnalysisJob } from "../application/analysis-job.runner.js";
import { jobStore } from "../jobs/job.store.js";
import { env } from "../config/env.js";
import { parseGitHubUrl } from "../github/github-url.js";
import { resolveRepository } from "../github/github.client.js";
import {
  githubCacheKey,
  reportCache,
  uploadCacheKey,
} from "../cache/report-cache.js";
import type { AnalysisSource } from "../jobs/job.types.js";

const router = Router();

function isBusy(): boolean {
  return jobStore.runningCount() >= env.MAX_CONCURRENT_JOBS;
}

/**
 * Reuses a cached report, joins an identical analysis already running,
 * or starts a new job. Responses:
 *
 * - 200 { jobId, cached: true }   finished report from the cache
 * - 200 { jobId, joined: true }   same input is already being analyzed
 * - 202 { jobId }                 new analysis started
 * - 429 SERVER_BUSY               too many analyses running
 *
 * Only 202 counts toward the rate limits. In every case the client
 * follows GET /api/jobs/:id/events for the result.
 *
 * `cleanup` runs when the source is not needed (an uploaded ZIP that
 * will not be analyzed).
 */
async function startOrReuse(
  res: Response,
  options: {
    cacheKey: string;
    force: boolean;
    source: AnalysisSource;
    cleanup?: () => Promise<void>;
    extra?: Record<string, unknown>;
  },
) {
  const { cacheKey, force, source, cleanup, extra } = options;

  if (!force) {
    const cached = await reportCache.lookup(cacheKey);

    if (cached) {
      await cleanup?.();

      const job = jobStore.create();
      jobStore.complete(job.id, { ...cached, cached: true });

      return res.status(200).json({ success: true, jobId: job.id, cached: true, ...extra });
    }
  }

  const runningJobId = reportCache.runningJob(cacheKey);

  if (runningJobId) {
    await cleanup?.();

    return res.status(200).json({ success: true, jobId: runningJobId, joined: true, ...extra });
  }

  if (isBusy()) {
    await cleanup?.();

    return res.status(429).json({
      success: false,
      error: "SERVER_BUSY",
      message:
        "The server is busy with other analyses. Please try again in a minute.",
    });
  }

  const job = jobStore.create();

  reportCache.track(cacheKey, job.id);

  void runAnalysisJob(job.id, source, { cacheKey });

  return res.status(202).json({ success: true, jobId: job.id, ...extra });
}

/**
 * Accepts a ZIP upload and starts (or reuses) an analysis.
 * Form fields: `repository` (the ZIP), optional `force=true` to skip
 * the cache and analyze again.
 *
 * Rate limits are checked before the upload is received.
 * Progress and the final report are delivered by
 * GET /api/jobs/:id/events (Server-Sent Events).
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

    const zipPath = req.file.path;

    return startOrReuse(res, {
      cacheKey: await uploadCacheKey(zipPath),
      force: req.body?.force === "true",
      source: {
        type: "upload",
        zipPath,
        fileName: req.file.originalname,
      },
      cleanup: () => fs.rm(zipPath, { force: true }),
    });
  },
);

/**
 * Starts (or reuses) an analysis of a public GitHub repository.
 * Body: { "url": "https://github.com/owner/repo", "force"?: true }
 *
 * The URL is checked and the repository looked up on GitHub first, so
 * mistakes (typos, private repositories) are reported immediately and
 * do not count toward the rate limit. The download happens in the job.
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

    // Throws GitHubError, which the error handler turns into JSON.
    const repository = await resolveRepository(parseGitHubUrl(url));

    return startOrReuse(res, {
      cacheKey: githubCacheKey(repository.fullName, repository.commitSha),
      force: req.body?.force === true,
      source: { type: "github", repository },
      extra: {
        repository: {
          name: repository.fullName,
          commitSha: repository.commitSha,
        },
      },
    });
  },
);

export default router;
