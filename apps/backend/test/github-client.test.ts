import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  downloadRepositoryZip,
  resolveRepository,
  type ResolvedRepository,
} from "../src/github/github.client.js";
import { GitHubError } from "../src/github/github.errors.js";
import { tempDir } from "./helpers/zip.js";

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function download(bytes: Uint8Array, url: string, headers: Record<string, string> = {}) {
  const response = new Response(new Uint8Array(bytes), { status: 200, headers });

  // Response.url is set by fetch after redirects; fake it here.
  Object.defineProperty(response, "url", { value: url });

  return response;
}

const repoResponse = {
  full_name: "Owner/Repo",
  private: false,
  default_branch: "main",
  html_url: "https://github.com/Owner/Repo",
};

const resolved: ResolvedRepository = {
  fullName: "Owner/Repo",
  owner: "Owner",
  repo: "Repo",
  ref: "main",
  commitSha: "a".repeat(40),
  htmlUrl: "https://github.com/Owner/Repo",
};

function mockFetch(...responses: Response[]) {
  const fetchMock = vi.fn();

  for (const response of responses) {
    fetchMock.mockResolvedValueOnce(response);
  }

  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

async function expectGitHubError(promise: Promise<unknown>, code: string) {
  const error = await promise.catch((e: unknown) => e);

  expect(error).toBeInstanceOf(GitHubError);
  expect((error as GitHubError).code).toBe(code);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveRepository", () => {
  it("resolves the default branch to an exact commit", async () => {
    const fetchMock = mockFetch(
      json(200, repoResponse),
      json(200, { sha: "b".repeat(40) }),
    );

    const result = await resolveRepository({ owner: "owner", repo: "repo" });

    expect(result).toEqual({
      fullName: "Owner/Repo",
      owner: "Owner",
      repo: "Repo",
      ref: "main",
      commitSha: "b".repeat(40),
      htmlUrl: "https://github.com/Owner/Repo",
    });
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "https://api.github.com/repos/owner/repo",
      "https://api.github.com/repos/owner/repo/commits/main",
    ]);
  });

  it("keeps slashes in branch names", async () => {
    const fetchMock = mockFetch(json(200, repoResponse), json(200, { sha: "c".repeat(40) }));

    await resolveRepository({ owner: "owner", repo: "repo", ref: "feature/login" });

    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://api.github.com/repos/owner/repo/commits/feature/login",
    );
  });

  it("reports missing repositories", async () => {
    mockFetch(json(404, { message: "Not Found" }));

    await expectGitHubError(
      resolveRepository({ owner: "owner", repo: "missing" }),
      "GITHUB_REPO_NOT_FOUND",
    );
  });

  it("refuses private repositories even when the token can see them", async () => {
    mockFetch(json(200, { ...repoResponse, private: true }));

    await expectGitHubError(
      resolveRepository({ owner: "owner", repo: "repo" }),
      "GITHUB_REPO_PRIVATE",
    );
  });

  it("reports unknown branches", async () => {
    mockFetch(json(200, repoResponse), json(422, { message: "No commit found" }));

    await expectGitHubError(
      resolveRepository({ owner: "owner", repo: "repo", ref: "nope" }),
      "GITHUB_UNAVAILABLE",
    );

    mockFetch(json(200, repoResponse), json(404, { message: "Not Found" }));

    await expectGitHubError(
      resolveRepository({ owner: "owner", repo: "repo", ref: "nope" }),
      "GITHUB_REF_NOT_FOUND",
    );
  });

  it("explains GitHub's rate limit", async () => {
    mockFetch(json(403, { message: "API rate limit exceeded" }, { "x-ratelimit-remaining": "0" }));

    await expectGitHubError(
      resolveRepository({ owner: "owner", repo: "repo" }),
      "GITHUB_RATE_LIMITED",
    );
  });

  it("reports network failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    await expectGitHubError(
      resolveRepository({ owner: "owner", repo: "repo" }),
      "GITHUB_UNAVAILABLE",
    );
  });
});

describe("downloadRepositoryZip", () => {
  it("downloads the exact commit to a file", async () => {
    const fetchMock = mockFetch(
      download(new Uint8Array([1, 2, 3]), "https://codeload.github.com/Owner/Repo/legacy.zip/abc"),
    );
    const target = path.join(await tempDir(), "repo.zip");

    await downloadRepositoryZip(resolved, target, 1000);

    expect(fetchMock.mock.calls[0][0]).toBe(
      `https://api.github.com/repos/Owner/Repo/zipball/${"a".repeat(40)}`,
    );
    expect([...(await fs.readFile(target))]).toEqual([1, 2, 3]);
  });

  it("stops and deletes the file when the download exceeds the limit", async () => {
    mockFetch(
      download(new Uint8Array(2000), "https://codeload.github.com/Owner/Repo/legacy.zip/abc"),
    );
    const target = path.join(await tempDir(), "repo.zip");

    await expectGitHubError(
      downloadRepositoryZip(resolved, target, 1000),
      "GITHUB_REPO_TOO_LARGE",
    );
    await expect(fs.stat(target)).rejects.toThrow();
  });

  it("rejects early when GitHub declares a size over the limit", async () => {
    mockFetch(
      download(new Uint8Array(10), "https://codeload.github.com/x", { "content-length": "5000" }),
    );

    await expectGitHubError(
      downloadRepositoryZip(resolved, path.join(await tempDir(), "repo.zip"), 1000),
      "GITHUB_REPO_TOO_LARGE",
    );
  });

  it("refuses downloads redirected outside GitHub", async () => {
    mockFetch(download(new Uint8Array(10), "https://evil.example/repo.zip"));

    await expectGitHubError(
      downloadRepositoryZip(resolved, path.join(await tempDir(), "repo.zip"), 1000),
      "GITHUB_UNAVAILABLE",
    );
  });
});
