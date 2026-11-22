import type { RequestHandler } from "express";
import {
  ipKeyGenerator,
  rateLimit,
  type AugmentedRequest,
} from "express-rate-limit";

import { env } from "../config/env.js";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function formatWait(resetTime: Date | undefined): string {
  if (!resetTime) {
    return "later";
  }

  const minutes = Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 60_000));

  if (minutes <= 60) {
    return `in ${minutes} minute${minutes === 1 ? "" : "s"}`;
  }

  const hours = Math.ceil(minutes / 60);

  return `in about ${hours} hour${hours === 1 ? "" : "s"}`;
}

const passThrough: RequestHandler = (_req, _res, next) => next();

/**
 * Limits for starting analyses (POST /api/analyze). Each analysis is a
 * paid Gemini call, so the public demo needs a ceiling on usage.
 *
 * - per visitor: RATE_LIMIT_PER_HOUR analyses per IP address per hour
 *   (IPv6 addresses are grouped by /56 subnet, so one user cannot
 *   rotate through addresses)
 * - whole site: RATE_LIMIT_PER_DAY analyses per day across all visitors
 *
 * Only accepted analyses count: requests that end in an error
 * (bad upload, server busy, limit reached) do not use up the limit.
 * Runs before the upload is received, so a limited visitor cannot
 * send a large file first.
 *
 * Counters are kept in memory (single server instance).
 */
export const analysisRateLimits: RequestHandler[] = [
  env.RATE_LIMIT_PER_DAY > 0
    ? rateLimit({
        windowMs: DAY_MS,
        limit: env.RATE_LIMIT_PER_DAY,
        keyGenerator: () => "site",
        skipFailedRequests: true,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        handler: (req, res) => {
          res.status(429).json({
            success: false,
            error: "DAILY_LIMIT_REACHED",
            message: `This demo has reached its daily analysis limit. Please try again ${formatWait(
              (req as AugmentedRequest).rateLimit?.resetTime,
            )}.`,
          });
        },
      })
    : passThrough,

  env.RATE_LIMIT_PER_HOUR > 0
    ? rateLimit({
        windowMs: HOUR_MS,
        limit: env.RATE_LIMIT_PER_HOUR,
        keyGenerator: (req) => ipKeyGenerator(req.ip ?? "unknown"),
        skipFailedRequests: true,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        handler: (req, res) => {
          res.status(429).json({
            success: false,
            error: "RATE_LIMITED",
            message: `You have started ${env.RATE_LIMIT_PER_HOUR} ${
              env.RATE_LIMIT_PER_HOUR === 1 ? "analysis" : "analyses"
            } in the last hour. Please try again ${formatWait(
              (req as AugmentedRequest).rateLimit?.resetTime,
            )}.`,
          });
        },
      })
    : passThrough,
];
