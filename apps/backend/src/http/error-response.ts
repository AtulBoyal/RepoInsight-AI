import multer from "multer";

import { MAX_UPLOAD_SIZE } from "../constants/upload.js";
import { InvalidArchiveError } from "../repository/errors/InvalidArchiveError.js";
import { RepositoryTooLargeError } from "../repository/errors/RepositoryTooLargeError.js";
import type { JobError } from "../jobs/job.types.js";
import { GitHubError } from "../github/github.errors.js";
import { ShareError } from "../sharing/share.errors.js";

export class CorsError extends Error {}

/**
 * Maps any error to the JSON error response the frontend understands.
 * Used both by the Express error handler and by background jobs.
 */
export function toErrorResponse(err: unknown): JobError {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return {
        status: 413,
        body: {
          success: false,
          error: "UPLOAD_TOO_LARGE",
          message: `Maximum upload size is ${MAX_UPLOAD_SIZE / 1024 / 1024} MB.`,
        },
      };
    }

    return {
      status: 400,
      body: { success: false, error: "INVALID_UPLOAD", message: err.message },
    };
  }

  if (err instanceof InvalidArchiveError) {
    return {
      status: 400,
      body: { success: false, error: "INVALID_ARCHIVE", message: err.message },
    };
  }

  if (err instanceof RepositoryTooLargeError) {
    return {
      status: 413,
      body: {
        success: false,
        error: "REPOSITORY_TOO_LARGE",
        message:
          "Repository exceeds the maximum supported analyzable source code size.",
        analyzableSizeMB: Number((err.size / 1024 / 1024).toFixed(1)),
        limitMB: Number((err.limit / 1024 / 1024).toFixed(0)),
      },
    };
  }

  if (err instanceof ShareError) {
    return {
      status: err.status,
      body: { success: false, error: err.code, message: err.message },
    };
  }

  if (err instanceof GitHubError) {
    return {
      status: err.status,
      body: { success: false, error: err.code, message: err.message },
    };
  }

  if (err instanceof CorsError) {
    return {
      status: 403,
      body: { success: false, error: "CORS_REJECTED", message: err.message },
    };
  }

  console.error("Unhandled error:", err);

  return {
    status: 500,
    body: {
      success: false,
      error: "INTERNAL_ERROR",
      message: err instanceof Error ? err.message : "Internal server error.",
    },
  };
}
