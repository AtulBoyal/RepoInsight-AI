import { Router, type Response } from "express";

import { jobStore } from "../jobs/job.store.js";
import type { Job } from "../jobs/job.types.js";

const router = Router();

/**
 * Comment lines keep the connection alive through proxies
 * (Render, Vercel, nginx) that close idle streams.
 */
const HEARTBEAT_INTERVAL_MS = 15_000;

function notFound(res: Response) {
  return res.status(404).json({
    success: false,
    error: "JOB_NOT_FOUND",
    message: "Analysis job not found. It may have expired.",
  });
}

/**
 * Converts a job into the Server-Sent Event the client expects:
 * - progress:  { stage, message, percentage }
 * - completed: { report, markdown }
 * - failed:    { status, ...error body }
 */
function toEvent(job: Job): { event: string; data: unknown } {
  if (job.status === "completed" && job.result) {
    return { event: "completed", data: job.result };
  }

  if (job.status === "failed" && job.error) {
    return {
      event: "failed",
      data: { status: job.error.status, ...job.error.body },
    };
  }

  return { event: "progress", data: job.progress };
}

/**
 * One-off snapshot of a job (useful for debugging or polling clients).
 */
router.get("/:id", (req, res) => {
  const job = jobStore.get(req.params.id);

  if (!job) {
    return notFound(res);
  }

  return res.json({ success: true, ...toEvent(job) });
});

/**
 * Streams a job's progress, then its result or error, as
 * Server-Sent Events. Sends the current state immediately on
 * connect, so reconnecting clients never miss the outcome.
 */
router.get("/:id/events", (req, res) => {
  const job = jobStore.get(req.params.id);

  if (!job) {
    return notFound(res);
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  let closed = false;

  const send = (current: Job) => {
    if (closed) return;

    const { event, data } = toEvent(current);

    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    if (current.status !== "running") {
      close();
      res.end();
    }
  };

  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, HEARTBEAT_INTERVAL_MS);

  const unsubscribe = jobStore.subscribe(job.id, send);

  function close() {
    if (closed) return;

    closed = true;
    clearInterval(heartbeat);
    unsubscribe();
  }

  req.on("close", close);

  send(job);
});

export default router;
