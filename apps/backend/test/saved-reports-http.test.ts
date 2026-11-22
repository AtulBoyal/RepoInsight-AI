import fs from "node:fs/promises";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createZip } from "./helpers/zip.js";
import { createTestDatabase } from "./helpers/database.js";

process.env.RATE_LIMIT_PER_HOUR = "0";
process.env.RATE_LIMIT_PER_DAY = "0";
process.env.MAX_CONCURRENT_JOBS = "100";

vi.mock("../src/ai/gemini/gemini.client.js", () => ({
  generateContent: vi.fn(),
}));

const { default: app } = await import("../src/app.js");
const { generateContent } = await import("../src/ai/gemini/gemini.client.js");
const { jobStore } = await import("../src/jobs/job.store.js");
const { setDatabase } = await import("../src/db/database.js");

const report = {
  summary: { purpose: "p", description: "d" },
  technologyStack: { languages: [], frameworks: [], databases: [], tools: [], infrastructure: [] },
  architecture: { summary: "s", strengths: [], weaknesses: [], scalability: "x", maintainability: "y" },
  folderStructure: { score: 7, positives: [], negatives: [], recommendations: [] },
  codeQuality: { score: 7, positives: [], negatives: [], recommendations: [] },
  strengths: [],
  weaknesses: [],
  improvements: [],
  resumeFeedback: { score: 7, summary: "s", strengths: [], improvements: [], bestResumeBullets: [] },
  interviewQuestions: [],
};

let server: Server;
let baseUrl: string;
let db: Awaited<ReturnType<typeof createTestDatabase>>;

beforeAll(async () => {
  vi.mocked(generateContent).mockResolvedValue({ text: JSON.stringify(report) });

  db = await createTestDatabase();
  setDatabase(db);

  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.close();
  setDatabase(undefined);
  await db.close();
});

async function analyzeZip(content: string) {
  const bytes = new Uint8Array(
    await fs.readFile(await createZip([{ name: "repo/index.ts", content }])),
  );
  const form = new FormData();
  form.append("repository", new Blob([bytes]), "demo.zip");

  const response = await fetch(`${baseUrl}/api/analyze`, { method: "POST", body: form });
  const { jobId } = (await response.json()) as { jobId: string };

  await vi.waitFor(() => {
    expect(jobStore.get(jobId)?.status).not.toBe("running");
  });

  return jobStore.get(jobId)!;
}

describe("saved reports over HTTP", () => {
  it("shares a finished report, serves it by link and unshares it", async () => {
    const job = await analyzeZip("export const shared = 1;");
    const reportId = job.result?.reportId;

    expect(reportId).toMatch(/^[0-9a-f-]{36}$/);

    const shareResponse = await fetch(`${baseUrl}/api/reports/${reportId}/share`, {
      method: "POST",
    });
    const share = (await shareResponse.json()) as { shareId: string; ownerToken: string };

    expect(shareResponse.status).toBe(200);

    const viewResponse = await fetch(`${baseUrl}/api/shared/${share.shareId}`);
    const view = (await viewResponse.json()) as { repository: { name: string }; markdown: string };

    expect(viewResponse.status).toBe(200);
    expect(viewResponse.headers.get("x-robots-tag")).toBe("noindex");
    expect(view.repository.name).toBe("demo");
    expect(view.markdown).toContain("# AI Project Review");

    const forbidden = await fetch(`${baseUrl}/api/shared/${share.shareId}`, {
      method: "DELETE",
      headers: { Authorization: "Bearer not-the-token" },
    });
    expect(forbidden.status).toBe(403);

    const removed = await fetch(`${baseUrl}/api/shared/${share.shareId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${share.ownerToken}` },
    });
    expect(removed.status).toBe(204);

    const gone = await fetch(`${baseUrl}/api/shared/${share.shareId}`);
    expect(gone.status).toBe(404);
  });

  it("serves a repeat analysis from the database with the same report id", async () => {
    const callsBefore = vi.mocked(generateContent).mock.calls.length;

    const first = await analyzeZip("export const again = 1;");
    const second = await analyzeZip("export const again = 1;");

    expect(second.result?.cached).toBe(true);
    expect(second.result?.reportId).toBe(first.result?.reportId);
    // Only the first of the two identical uploads called Gemini.
    expect(vi.mocked(generateContent).mock.calls.length - callsBefore).toBe(1);
  });

  it("does not rate limit unrelated routes such as the health check", async () => {
    for (let i = 0; i < 70; i++) {
      const health = await fetch(`${baseUrl}/api/health`);
      expect(health.status).toBe(200);
    }
  });
});
