import express from "express";
import cors from "cors";
import multer from "multer";

import analyzeRouter from "./routes/analyze.js";
import healthRouter from "./routes/health.js";
import progressRouter from "./routes/progress.js";
import { MAX_UPLOAD_SIZE } from "./constants/upload.js";
import { InvalidArchiveError } from "./repository/errors/InvalidArchiveError.js";
import { RepositoryTooLargeError } from "./repository/errors/RepositoryTooLargeError.js";

const app = express();

class CorsError extends Error {}

const allowedOrigins = [
  "http://localhost:5173",
  process.env.FRONTEND_URL,
];

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      callback(new CorsError("Origin not allowed."));
    },
  }),
);

app.use(express.json());

app.use("/api", analyzeRouter);

app.use("/api/progress", progressRouter);

app.use("/api/health", healthRouter);

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: "NOT_FOUND",
    message: "Route not found.",
  });
});

/**
 * Maps every error to a JSON response the frontend can render.
 */
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          success: false,
          error: "UPLOAD_TOO_LARGE",
          message: `Maximum upload size is ${
            MAX_UPLOAD_SIZE / 1024 / 1024
          } MB.`,
        });
      }

      return res.status(400).json({
        success: false,
        error: "INVALID_UPLOAD",
        message: err.message,
      });
    }

    if (err instanceof InvalidArchiveError) {
      return res.status(400).json({
        success: false,
        error: "INVALID_ARCHIVE",
        message: err.message,
      });
    }

    if (err instanceof RepositoryTooLargeError) {
      return res.status(413).json({
        success: false,
        error: "REPOSITORY_TOO_LARGE",
        message:
          "Repository exceeds the maximum supported analyzable source code size.",
        analyzableSizeMB: Number((err.size / 1024 / 1024).toFixed(1)),
        limitMB: Number((err.limit / 1024 / 1024).toFixed(0)),
      });
    }

    if (err instanceof CorsError) {
      return res.status(403).json({
        success: false,
        error: "CORS_REJECTED",
        message: err.message,
      });
    }

    console.error("Unhandled error:", err);

    return res.status(500).json({
      success: false,
      error: "INTERNAL_ERROR",
      message:
        err instanceof Error
          ? err.message
          : "Internal server error.",
    });
  },
);

export default app;
