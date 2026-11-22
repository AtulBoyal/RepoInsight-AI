import fs from "node:fs/promises";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createZip } from "./helpers/zip.js";

// Small limits for the test. Each test file gets fresh modules,
// so these only apply here.
process.env.RATE_LIMIT_PER_HOUR = "2";
process.env.RATE_LIMIT_PER_DAY = "3";
process.env.TRUST_PROXY_HOPS = "1";
process.env.MAX_CONCURRENT_JOBS = "100";

// Never run a real analysis: just delete the uploaded file.
vi.mock("../src/application/analysis-job.runner.js", () => ({
  runAnalysisJob: vi.fn(async (_jobId: string, source: { zipPath?: string }) => {
    if (source.zipPath) await fs.rm(source.zipPath, { force: true });
  }),
}));

const { default: app } = await import("../src/app.js");

let server: Server;
let baseUrl: string;
let zipBytes: Buffer;

beforeAll(async () => {
  zipBytes = await fs.readFile(
    await createZip([{ name: "repo/index.ts", content: "export {};" }]),
  );

  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

/**
 * Uploads a file as if from `ip` (via the X-Forwarded-For header the
 * proxy would add).
 */
async function upload(ip: string, fileName = "repo.zip") {
  const form = new FormData();
  form.append("repository", new Blob([new Uint8Array(zipBytes)]), fileName);

  const response = await fetch(`${baseUrl}/api/analyze`, {
    method: "POST",
    body: form,
    headers: { "X-Forwarded-For": ip },
  });

  return {
    status: response.status,
    body: (await response.json()) as { error?: string; message?: string },
    headers: response.headers,
  };
}

describe("analysis rate limits", () => {
  it("does not count rejected uploads", async () => {
    for (let i = 0; i < 4; i++) {
      const rejected = await upload("203.0.113.1", "notes.txt");
      expect(rejected.status).toBe(400);
    }

    expect((await upload("203.0.113.1")).status).toBe(202);
  });

  it("limits each visitor per hour", async () => {
    expect((await upload("203.0.113.1")).status).toBe(202);

    const blocked = await upload("203.0.113.1");

    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe("RATE_LIMITED");
    expect(blocked.body.message).toMatch(/try again in \d+ minutes?/);
    expect(blocked.headers.get("ratelimit")).toBeTruthy();
  });

  it("keeps separate limits for different visitors", async () => {
    expect((await upload("198.51.100.7")).status).toBe(202);
  });

  it("stops everyone once the daily site limit is reached", async () => {
    // 3 analyses accepted so far (2 + 1), which is the daily limit.
    const blocked = await upload("192.0.2.50");

    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe("DAILY_LIMIT_REACHED");
  });
});
