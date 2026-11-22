import express from "express";
import cors from "cors";

import analyzeRouter from "./routes/analyze.js";
import healthRouter from "./routes/health.js";
import jobsRouter from "./routes/jobs.js";
import { CorsError, toErrorResponse } from "./http/error-response.js";
import { env } from "./config/env.js";

const app = express();

// Read the visitor's real IP from X-Forwarded-For when running behind
// a reverse proxy (Render). Used by the rate limits.
app.set("trust proxy", env.TRUST_PROXY_HOPS);

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

app.use("/api/jobs", jobsRouter);

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
    const { status, body } = toErrorResponse(err);

    res.status(status).json(body);
  },
);

export default app;
