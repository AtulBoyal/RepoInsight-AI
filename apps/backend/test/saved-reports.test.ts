import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase } from "./helpers/database.js";
import { PostgresReportStore } from "../src/cache/postgres-report-store.js";
import { deleteExpiredReports, setDatabase, type Database } from "../src/db/database.js";
import {
  getSharedReport,
  shareReport,
  unshareReport,
} from "../src/sharing/share.service.js";
import { ShareError } from "../src/sharing/share.errors.js";
import type { JobResult } from "../src/jobs/job.types.js";

const report = {
  summary: { purpose: "Demo app", description: "d" },
  technologyStack: { languages: [], frameworks: [], databases: [], tools: [], infrastructure: [] },
  architecture: { summary: "s", strengths: [], weaknesses: [], scalability: "x", maintainability: "y" },
  folderStructure: { score: 7, positives: [], negatives: [], recommendations: [] },
  codeQuality: { score: 6, positives: [], negatives: [], recommendations: [] },
  strengths: [],
  weaknesses: [],
  improvements: [],
  resumeFeedback: { score: 7, summary: "s", strengths: [], improvements: [], bestResumeBullets: [] },
  interviewQuestions: [],
};

function result(overrides: Partial<JobResult> = {}): JobResult {
  return {
    report,
    markdown: "ignored: rebuilt when read",
    repository: { name: "Owner/Repo", url: "https://github.com/Owner/Repo", commitSha: "f".repeat(40) },
    analyzedAt: new Date().toISOString(),
    cached: false,
    ...overrides,
  };
}

async function shareErrorCode(promise: Promise<unknown>): Promise<string> {
  const error = await promise.catch((e: unknown) => e);

  expect(error).toBeInstanceOf(ShareError);

  return (error as ShareError).code;
}

let db: Database;
let store: PostgresReportStore;

beforeEach(async () => {
  db = await createTestDatabase();
  store = new PostgresReportStore(db, 30);
  setDatabase(db);
});

afterEach(async () => {
  setDatabase(undefined);
  await db.close();
});

describe("PostgresReportStore", () => {
  it("saves a report and finds it by cache key, rebuilding the Markdown", async () => {
    const id = await store.set("key-1", result());
    const found = await store.get("key-1");

    expect(found?.reportId).toBe(id);
    expect(found?.report).toEqual(report);
    expect(found?.markdown).toContain("**Repository:** [Owner/Repo](https://github.com/Owner/Repo)");
    expect(found?.markdown).toContain("Demo app");
    expect(await store.get("other-key")).toBeUndefined();
  });

  it("replaces the report on re-analysis but keeps its id", async () => {
    const first = await store.set("key-1", result({ analyzedAt: "2026-11-01T00:00:00.000Z" }));
    const second = await store.set("key-1", result());

    expect(second).toBe(first);
    expect((await store.get("key-1"))?.analyzedAt).not.toBe("2026-11-01T00:00:00.000Z");
  });

  it("ignores and deletes expired reports", async () => {
    await store.set("old", result({ analyzedAt: "2020-01-01T00:00:00.000Z" }));
    await store.set("new", result());

    expect(await store.get("old")).toBeUndefined();
    expect(await deleteExpiredReports(db)).toBe(1);
    expect(await store.get("new")).toBeDefined();
  });
});

describe("sharing", () => {
  it("creates a link once and returns the same link afterwards", async () => {
    const reportId = await store.set("key-1", result());

    const first = await shareReport(reportId);
    expect(first.shareId).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(first.ownerToken).toBeTruthy();

    const again = await shareReport(reportId);
    expect(again.shareId).toBe(first.shareId);
    expect(again.ownerToken).toBeUndefined();
  });

  it("serves the shared report until the owner unshares it", async () => {
    const reportId = await store.set("key-1", result());
    const { shareId, ownerToken } = await shareReport(reportId);

    const shared = await getSharedReport(shareId);
    expect(shared.report).toEqual(report);
    expect(shared.repository.name).toBe("Owner/Repo");
    expect(Date.parse(shared.expiresAt)).toBeGreaterThan(Date.now());

    expect(await shareErrorCode(unshareReport(shareId, "wrong-token"))).toBe("NOT_SHARE_OWNER");

    await unshareReport(shareId, ownerToken!);

    expect(await shareErrorCode(getSharedReport(shareId))).toBe("SHARED_REPORT_NOT_FOUND");

    // The report itself stays saved for the cache.
    expect(await store.get("key-1")).toBeDefined();
  });

  it("stores only a hash of the owner token", async () => {
    const reportId = await store.set("key-1", result());
    const { ownerToken } = await shareReport(reportId);

    const { rows } = await db.query<{ owner_token_hash: string }>(
      "SELECT owner_token_hash FROM reports WHERE id = $1",
      [reportId],
    );

    expect(rows[0].owner_token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0].owner_token_hash).not.toContain(ownerToken!);
  });

  it("does not share or serve expired reports", async () => {
    const reportId = await store.set("old", result({ analyzedAt: "2020-01-01T00:00:00.000Z" }));

    expect(await shareErrorCode(shareReport(reportId))).toBe("REPORT_NOT_FOUND");
  });

  it("rejects malformed ids without querying", async () => {
    expect(await shareErrorCode(shareReport("not-a-uuid"))).toBe("REPORT_NOT_FOUND");
    expect(await shareErrorCode(getSharedReport("short"))).toBe("SHARED_REPORT_NOT_FOUND");
    expect(await shareErrorCode(getSharedReport("x".repeat(22)))).toBe("SHARED_REPORT_NOT_FOUND");
  });

  it("is unavailable without a database", async () => {
    setDatabase(undefined);

    expect(await shareErrorCode(getSharedReport("x".repeat(22)))).toBe("SHARING_UNAVAILABLE");
  });
});
