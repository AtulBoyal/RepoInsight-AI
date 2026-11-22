import fs from "node:fs";
import fsPromises from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import { env } from "../config/env.js";
import { GitHubError } from "./github.errors.js";
import type { GitHubRepositoryRef } from "./github-url.js";

const API = "https://api.github.com";

const METADATA_TIMEOUT_MS = 10_000;
const DOWNLOAD_TIMEOUT_MS = 120_000;

/**
 * Hosts a zipball download may end up on after GitHub's redirect.
 */
const ALLOWED_DOWNLOAD_HOSTS = new Set([
  "api.github.com",
  "codeload.github.com",
]);

export interface ResolvedRepository {
  /** Canonical "owner/repo" as GitHub spells it. */
  fullName: string;
  owner: string;
  repo: string;
  /** Branch, tag or commit that was requested (default branch if none). */
  ref: string;
  /** Exact commit that will be analyzed. */
  commitSha: string;
  htmlUrl: string;
}

function headers(): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "RepoInsight-AI",
    ...(env.GITHUB_TOKEN ? { Authorization: `Bearer ${env.GITHUB_TOKEN}` } : {}),
  };
}

function encodePath(value: string): string {
  return value.split("/").map(encodeURIComponent).join("/");
}

/**
 * Turns a failed GitHub response into an error the user can act on.
 */
function toGitHubError(response: Response, notFound: GitHubError): GitHubError {
  if (response.status === 404) {
    return notFound;
  }

  if (
    response.status === 429 ||
    (response.status === 403 &&
      response.headers.get("x-ratelimit-remaining") === "0")
  ) {
    return new GitHubError(
      "GITHUB_RATE_LIMITED",
      "GitHub's request limit for this server has been reached. Please try again later, or upload the repository as a ZIP.",
    );
  }

  return new GitHubError(
    "GITHUB_UNAVAILABLE",
    `GitHub could not be reached (status ${response.status}). Please try again, or upload the repository as a ZIP.`,
  );
}

async function githubFetch(url: string, timeoutMs: number): Promise<Response> {
  try {
    return await fetch(url, {
      headers: headers(),
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new GitHubError(
      "GITHUB_UNAVAILABLE",
      "GitHub could not be reached. Please try again, or upload the repository as a ZIP.",
    );
  }
}

/**
 * Looks up a public repository and the exact commit to analyze.
 * Runs before a job is created, so problems are reported immediately.
 */
export async function resolveRepository(
  target: GitHubRepositoryRef,
): Promise<ResolvedRepository> {
  const repoPath = `${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}`;

  const notFound = new GitHubError(
    "GITHUB_REPO_NOT_FOUND",
    `Repository ${target.owner}/${target.repo} was not found. Only public repositories can be analyzed.`,
  );

  const repoResponse = await githubFetch(`${API}/repos/${repoPath}`, METADATA_TIMEOUT_MS);

  if (!repoResponse.ok) {
    throw toGitHubError(repoResponse, notFound);
  }

  const repository = (await repoResponse.json()) as {
    full_name: string;
    private: boolean;
    default_branch: string;
    html_url: string;
  };

  // A token could see private repositories; never analyze them.
  if (repository.private) {
    throw new GitHubError(
      "GITHUB_REPO_PRIVATE",
      "Private repositories cannot be analyzed by URL. Upload a ZIP instead.",
    );
  }

  const ref = target.ref ?? repository.default_branch;

  const commitResponse = await githubFetch(
    `${API}/repos/${repoPath}/commits/${encodePath(ref)}`,
    METADATA_TIMEOUT_MS,
  );

  if (!commitResponse.ok) {
    throw toGitHubError(
      commitResponse,
      new GitHubError(
        "GITHUB_REF_NOT_FOUND",
        `Branch, tag or commit "${ref}" was not found in ${repository.full_name}.`,
      ),
    );
  }

  const commit = (await commitResponse.json()) as { sha: string };

  const [owner, repo] = repository.full_name.split("/");

  return {
    fullName: repository.full_name,
    owner,
    repo,
    ref,
    commitSha: commit.sha,
    htmlUrl: repository.html_url,
  };
}

/**
 * Downloads the repository at the resolved commit as a ZIP.
 * Stops (and deletes the partial file) if it exceeds `maxBytes`.
 */
export async function downloadRepositoryZip(
  repository: ResolvedRepository,
  destination: string,
  maxBytes: number,
): Promise<void> {
  const response = await githubFetch(
    `${API}/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/zipball/${repository.commitSha}`,
    DOWNLOAD_TIMEOUT_MS,
  );

  if (!response.ok || !response.body) {
    throw toGitHubError(
      response,
      new GitHubError(
        "GITHUB_REPO_NOT_FOUND",
        `Repository ${repository.fullName} is no longer available.`,
      ),
    );
  }

  if (!ALLOWED_DOWNLOAD_HOSTS.has(new URL(response.url).hostname)) {
    throw new GitHubError(
      "GITHUB_UNAVAILABLE",
      "GitHub returned an unexpected download location.",
    );
  }

  const tooLarge = new GitHubError(
    "GITHUB_REPO_TOO_LARGE",
    `${repository.fullName} is larger than the ${Math.round(maxBytes / 1024 / 1024)} MB download limit.`,
  );

  const declared = Number(response.headers.get("content-length"));

  if (declared > maxBytes) {
    await response.body.cancel();
    throw tooLarge;
  }

  let received = 0;

  const limit = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length;

      callback(received > maxBytes ? tooLarge : null, chunk);
    },
  });

  try {
    await pipeline(
      Readable.fromWeb(response.body as import("node:stream/web").ReadableStream),
      limit,
      fs.createWriteStream(destination),
    );
  } catch (error) {
    await fsPromises.rm(destination, { force: true });

    if (error instanceof GitHubError) {
      throw error;
    }

    throw new GitHubError(
      "GITHUB_UNAVAILABLE",
      "The download from GitHub was interrupted. Please try again.",
    );
  }
}
