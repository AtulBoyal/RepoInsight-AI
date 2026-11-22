import { Router } from "express";

import { shareRateLimit } from "../http/rate-limit.js";
import {
  getSharedReport,
  shareReport,
  unshareReport,
} from "../sharing/share.service.js";

// The limit is attached per route: a router-level `use` would also run
// for every later /api route (such as /api/health).
const router = Router();

/**
 * Creates a public link for a saved report (the reportId comes with a
 * finished analysis when a database is configured).
 * 200 { shareId, expiresAt, ownerToken? }
 */
router.post("/reports/:reportId/share", shareRateLimit, async (req, res) => {
  const result = await shareReport(String(req.params.reportId));

  res.json({ success: true, ...result });
});

/**
 * A shared report: { report, markdown, repository, analyzedAt, expiresAt }
 */
router.get("/shared/:shareId", shareRateLimit, async (req, res) => {
  const shared = await getSharedReport(String(req.params.shareId));

  res.set("Cache-Control", "private, max-age=60");
  res.set("X-Robots-Tag", "noindex");
  res.json({ success: true, ...shared });
});

/**
 * Removes a public link. Header: Authorization: Bearer <ownerToken>
 */
router.delete("/shared/:shareId", shareRateLimit, async (req, res) => {
  const token = req.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      error: "NOT_SHARE_OWNER",
      message: "Only the browser that shared this report can unshare it.",
    });
  }

  await unshareReport(String(req.params.shareId), token);

  return res.status(204).end();
});

export default router;
