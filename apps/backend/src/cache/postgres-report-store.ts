import { randomUUID } from "node:crypto";

import { buildMarkdown } from "../ai/report/markdown.service.js";
import type { EngineeringReport } from "../ai/report/report.types.js";
import type { Database } from "../db/database.js";
import type { JobResult } from "../jobs/job.types.js";
import type { RepositoryInfo } from "../types/repository-info.js";
import type { ReportStore } from "./report-store.js";

interface ReportRow {
  id: string;
  report: EngineeringReport;
  repository: RepositoryInfo;
  analyzed_at: Date;
}

/**
 * Saved reports in Postgres. Each row is both a cache entry (looked up
 * by cache key) and a report that can be shared by link.
 *
 * Only the report and repository are stored; the Markdown is rebuilt
 * when read. Rows expire after REPORT_RETENTION_DAYS.
 */
export class PostgresReportStore implements ReportStore {
  constructor(
    private readonly db: Database,
    private readonly retentionDays: number,
  ) {}

  async get(key: string): Promise<JobResult | undefined> {
    const { rows } = await this.db.query<ReportRow>(
      `SELECT id, report, repository, analyzed_at
         FROM reports
        WHERE cache_key = $1 AND expires_at > now()`,
      [key],
    );

    const row = rows[0];

    if (!row) {
      return undefined;
    }

    return {
      report: row.report,
      markdown: buildMarkdown(row.report, row.repository),
      repository: row.repository,
      analyzedAt: new Date(row.analyzed_at).toISOString(),
      cached: false,
      reportId: row.id,
    };
  }

  /**
   * Inserts the report, or replaces it if this input was analyzed before
   * (a forced re-analysis). The id and any share link are kept, so an
   * existing link shows the newest analysis of the same code.
   */
  async set(key: string, result: JobResult): Promise<string> {
    const expiresAt = new Date(
      Date.parse(result.analyzedAt) + this.retentionDays * 24 * 60 * 60 * 1000,
    );

    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO reports (id, cache_key, report, repository, analyzed_at, expires_at)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::timestamptz, $6::timestamptz)
       ON CONFLICT (cache_key) DO UPDATE
         SET report = EXCLUDED.report,
             repository = EXCLUDED.repository,
             analyzed_at = EXCLUDED.analyzed_at,
             expires_at = EXCLUDED.expires_at
       RETURNING id`,
      [
        randomUUID(),
        key,
        JSON.stringify(result.report),
        JSON.stringify(result.repository),
        result.analyzedAt,
        expiresAt.toISOString(),
      ],
    );

    return rows[0].id;
  }
}
