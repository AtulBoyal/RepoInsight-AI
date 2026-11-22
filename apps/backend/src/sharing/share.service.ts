import { createHash, randomBytes } from "node:crypto";

import { buildMarkdown } from "../ai/report/markdown.service.js";
import type { EngineeringReport } from "../ai/report/report.types.js";
import { getDatabase, type Database } from "../db/database.js";
import type { RepositoryInfo } from "../types/repository-info.js";
import { ShareError } from "./share.errors.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 16 random bytes as base64url: 22 characters, 128 bits. */
const SHARE_ID = /^[A-Za-z0-9_-]{22}$/;

export interface ShareResult {
  shareId: string;
  expiresAt: string;
  /**
   * Secret that allows removing the link. Returned only to the request
   * that created the link; the database keeps only its SHA-256.
   */
  ownerToken?: string;
}

export interface SharedReport {
  report: EngineeringReport;
  markdown: string;
  repository: RepositoryInfo;
  analyzedAt: string;
  expiresAt: string;
}

function requireDatabase(): Database {
  const db = getDatabase();

  if (!db) {
    throw new ShareError(
      "SHARING_UNAVAILABLE",
      "Sharing is not available on this server (no database configured).",
    );
  }

  return db;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const notFound = () =>
  new ShareError(
    "SHARED_REPORT_NOT_FOUND",
    "This shared report does not exist, has expired, or was unshared.",
  );

/**
 * Creates a public link for a saved report. Sharing an already shared
 * report returns the existing link without an owner token.
 */
export async function shareReport(reportId: string): Promise<ShareResult> {
  const db = requireDatabase();

  const reportNotFound = new ShareError(
    "REPORT_NOT_FOUND",
    "This report is no longer available to share. Please analyze the repository again.",
  );

  if (!UUID.test(reportId)) {
    throw reportNotFound;
  }

  const shareId = randomBytes(16).toString("base64url");
  const ownerToken = randomBytes(32).toString("base64url");

  const created = await db.query<{ share_id: string; expires_at: Date }>(
    `UPDATE reports
        SET share_id = $2, owner_token_hash = $3, shared_at = now()
      WHERE id = $1 AND share_id IS NULL AND expires_at > now()
      RETURNING share_id, expires_at`,
    [reportId, shareId, hashToken(ownerToken)],
  );

  if (created.rows[0]) {
    return {
      shareId: created.rows[0].share_id,
      expiresAt: new Date(created.rows[0].expires_at).toISOString(),
      ownerToken,
    };
  }

  const existing = await db.query<{ share_id: string | null; expires_at: Date }>(
    `SELECT share_id, expires_at FROM reports WHERE id = $1 AND expires_at > now()`,
    [reportId],
  );

  const row = existing.rows[0];

  if (!row?.share_id) {
    throw reportNotFound;
  }

  return {
    shareId: row.share_id,
    expiresAt: new Date(row.expires_at).toISOString(),
  };
}

export async function getSharedReport(shareId: string): Promise<SharedReport> {
  const db = requireDatabase();

  if (!SHARE_ID.test(shareId)) {
    throw notFound();
  }

  const { rows } = await db.query<{
    report: EngineeringReport;
    repository: RepositoryInfo;
    analyzed_at: Date;
    expires_at: Date;
  }>(
    `SELECT report, repository, analyzed_at, expires_at
       FROM reports
      WHERE share_id = $1 AND expires_at > now()`,
    [shareId],
  );

  const row = rows[0];

  if (!row) {
    throw notFound();
  }

  return {
    report: row.report,
    markdown: buildMarkdown(row.report, row.repository),
    repository: row.repository,
    analyzedAt: new Date(row.analyzed_at).toISOString(),
    expiresAt: new Date(row.expires_at).toISOString(),
  };
}

/**
 * Removes a public link. Requires the owner token returned when the
 * link was created. The report itself stays saved (for the cache).
 */
export async function unshareReport(shareId: string, ownerToken: string): Promise<void> {
  const db = requireDatabase();

  if (!SHARE_ID.test(shareId)) {
    throw notFound();
  }

  const removed = await db.query(
    `UPDATE reports
        SET share_id = NULL, owner_token_hash = NULL, shared_at = NULL
      WHERE share_id = $1 AND owner_token_hash = $2`,
    [shareId, hashToken(ownerToken)],
  );

  if (removed.rowCount > 0) {
    return;
  }

  const exists = await db.query(`SELECT 1 FROM reports WHERE share_id = $1`, [shareId]);

  if (exists.rows.length > 0) {
    throw new ShareError(
      "NOT_SHARE_OWNER",
      "Only the browser that shared this report can unshare it.",
    );
  }

  throw notFound();
}
