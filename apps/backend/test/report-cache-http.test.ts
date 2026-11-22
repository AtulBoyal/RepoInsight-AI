import fs from "node:fs/promises";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createZip } from "./helpers/zip.js";

process.env.RATE_LIMIT_PER_HOUR = "3";
process.env.RATE_LIMIT_PER_DAY = "0";
process.env.MAX_CONCURRENT_JOBS = "100";

vi.mock("../src/ai/gemini/gemini.client.js", () => ({
  generateContent: vi.fn(),
}));

const { default: app } = await import("../src/app.js");
const { generateContent } = await import("../src/ai/gemini/gemini.client.js");
const { jobStore } = await import("../src/jobs/job.store.js");

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

beforeAll(async () => {
  vi.mocked(generateContent).mockResolvedValue({ text: JSON.stringify(report) });

  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

async function zipBytes(content: string): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(
    await fs.readFile(await createZip([{ name: "repo/index.ts", content }])),
  );
}

async function upload(bytes: Uint8Array<ArrayBuffer>, force = false) {
  const form = new FormData();

  if (force) {
    form.append("force", "true");
  }

  form.append("repository", new Blob([bytes]), "demo.zip");

  const response = await fetch(`${baseUrl}/api/analyze`, {
    method: "POST",
    body: form,
    headers: { "X-Forwarded-For": "203.0.113.20" },
  });

  return {
    status: response.status,
    body: (await response.json()) as { jobId: string; cached?: boolean; error?: string },
  };
}

async function finished(jobId: string) {
  await vi.waitFor(() => {
    expect(jobStore.get(jobId)?.status).not.toBe("running");
  });

  return jobStore.get(jobId)!;
}

describe("report cache over HTTP", () => {
  it("reuses, re-analyzes on request, and only counts new analyses", async () => {
    const a = await zipBytes("export const a = 1;");

    // 1. New analysis (limit used: 1 of 3).
    const first = await upload(a);
    expect(first.status).toBe(202);

    const firstJob = await finished(first.body.jobId);
    expect(firstJob.result?.cached).toBe(false);
    expect(firstJob.result?.repository.name).toBe("demo");
    expect(generateContent).toHaveBeenCalledTimes(1);

    // 2. Same ZIP: cached report, no Gemini call, limit not used.
    const second = await upload(a);
    expect(second.status).toBe(200);
    expect(second.body.cached).toBe(true);

    const secondJob = await finished(second.body.jobId);
    expect(secondJob.result).toMatchObject({
      cached: true,
      analyzedAt: firstJob.result?.analyzedAt,
      markdown: firstJob.result?.markdown,
    });
    expect(generateContent).toHaveBeenCalledTimes(1);

    // 3. Same ZIP with force: analyzed again (limit used: 2 of 3).
    const forced = await upload(a, true);
    expect(forced.status).toBe(202);

    const forcedJob = await finished(forced.body.jobId);
    expect(forcedJob.result?.cached).toBe(false);
    expect(generateContent).toHaveBeenCalledTimes(2);

    // 4. A different ZIP (limit used: 3 of 3). The cached hit in step 2
    //    did not count, otherwise this would be rejected.
    const other = await upload(await zipBytes("export const b = 2;"));
    expect(other.status).toBe(202);
    await finished(other.body.jobId);

    // 5. Limit reached: a forced re-analysis is a new analysis, so it is refused.
    const blocked = await upload(a, true);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe("RATE_LIMITED");
    expect(generateContent).toHaveBeenCalledTimes(3);
  });
});
