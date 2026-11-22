import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.RATE_LIMIT_PER_HOUR = "1";
process.env.RATE_LIMIT_PER_DAY = "0";
process.env.MAX_CONCURRENT_JOBS = "100";

vi.mock("../src/application/analysis-job.runner.js", () => ({
  runAnalysisJob: vi.fn(async () => {}),
}));

vi.mock("../src/github/github.client.js", () => ({
  resolveRepository: vi.fn(),
  downloadRepositoryZip: vi.fn(),
}));

const { default: app } = await import("../src/app.js");
const { resolveRepository } = await import("../src/github/github.client.js");
const { runAnalysisJob } = await import("../src/application/analysis-job.runner.js");
const { GitHubError } = await import("../src/github/github.errors.js");

const resolveMock = vi.mocked(resolveRepository);

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

async function analyze(body: unknown) {
  const response = await fetch(`${baseUrl}/api/analyze/github`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": "203.0.113.9" },
    body: JSON.stringify(body),
  });

  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
}

describe("POST /api/analyze/github", () => {
  it("rejects a missing or invalid URL without calling GitHub", async () => {
    expect((await analyze({})).status).toBe(400);

    const invalid = await analyze({ url: "https://gitlab.com/a/b" });

    expect(invalid.status).toBe(400);
    expect(invalid.body.error).toBe("INVALID_GITHUB_URL");
    expect(resolveMock).not.toHaveBeenCalled();
  });

  it("reports repositories GitHub cannot find", async () => {
    resolveMock.mockRejectedValueOnce(
      new GitHubError("GITHUB_REPO_NOT_FOUND", "Repository a/b was not found."),
    );

    const missing = await analyze({ url: "a/b" });

    expect(missing.status).toBe(404);
    expect(missing.body).toMatchObject({
      error: "GITHUB_REPO_NOT_FOUND",
      message: "Repository a/b was not found.",
    });
  });

  it("starts a job for a valid repository (errors above did not use the limit)", async () => {
    const repository = {
      fullName: "Owner/Repo",
      owner: "Owner",
      repo: "Repo",
      ref: "main",
      commitSha: "d".repeat(40),
      htmlUrl: "https://github.com/Owner/Repo",
    };
    resolveMock.mockResolvedValueOnce(repository);

    const started = await analyze({ url: "https://github.com/owner/repo" });

    expect(started.status).toBe(202);
    expect(started.body).toMatchObject({
      success: true,
      repository: { name: "Owner/Repo", commitSha: "d".repeat(40) },
    });
    expect(vi.mocked(runAnalysisJob)).toHaveBeenCalledWith(
      started.body.jobId,
      { type: "github", repository },
      { cacheKey: expect.stringContaining(`:github:owner/repo@${"d".repeat(40)}`) },
    );
  });

  it("applies the same per-visitor rate limit as uploads", async () => {
    const limited = await analyze({ url: "owner/repo" });

    expect(limited.status).toBe(429);
    expect(limited.body.error).toBe("RATE_LIMITED");
  });
});
