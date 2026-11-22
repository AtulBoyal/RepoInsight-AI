import { GitHubError } from "./github.errors.js";

export interface GitHubRepositoryRef {
  owner: string;
  repo: string;
  /** Branch, tag or commit from a /tree/<ref> URL; default branch if absent. */
  ref?: string;
}

/**
 * GitHub's own limits: owners are letters, digits and single hyphens;
 * repository names are letters, digits, '.', '-' and '_'.
 */
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;
const REF = /^[A-Za-z0-9._\-/]{1,255}$/;

const INVALID_MESSAGE =
  "Enter a public GitHub repository, like https://github.com/owner/repo or owner/repo.";

/**
 * Parses what a user pastes into the GitHub URL field:
 *
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo.git
 *   https://github.com/owner/repo/tree/branch-or-tag
 *   github.com/owner/repo
 *   owner/repo
 *
 * Only github.com is accepted, and every part is validated against
 * GitHub's naming rules, so the values are safe to put in API URLs.
 */
export function parseGitHubUrl(input: string): GitHubRepositoryRef {
  let text = input.trim();

  if (!text || text.length > 500) {
    throw new GitHubError("INVALID_GITHUB_URL", INVALID_MESSAGE);
  }

  // "." and ".." segments would be silently resolved by URL parsing
  // (github.com/a/b/../c → github.com/a/c): reject them instead.
  if (/(^|\/)\.{1,2}(\/|$|[?#])/.test(text.replace(/^https?:\/\//i, ""))) {
    throw new GitHubError("INVALID_GITHUB_URL", INVALID_MESSAGE);
  }

  let path: string;

  if (/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+\/?$/.test(text)) {
    // owner/repo shorthand
    path = text;
  } else {
    if (!/^https?:\/\//i.test(text)) {
      text = `https://${text}`;
    }

    let url: URL;

    try {
      url = new URL(text);
    } catch {
      throw new GitHubError("INVALID_GITHUB_URL", INVALID_MESSAGE);
    }

    const host = url.hostname.toLowerCase();

    if (host !== "github.com" && host !== "www.github.com") {
      throw new GitHubError(
        "INVALID_GITHUB_URL",
        "Only github.com repositories are supported.",
      );
    }

    path = decodeURIComponent(url.pathname);
  }

  const segments = path.split("/").filter(Boolean);

  if (segments.length < 2) {
    throw new GitHubError("INVALID_GITHUB_URL", INVALID_MESSAGE);
  }

  const owner = segments[0];
  const repo = segments[1].replace(/\.git$/i, "");

  if (!OWNER.test(owner) || !REPO.test(repo) || repo === "." || repo === "..") {
    throw new GitHubError("INVALID_GITHUB_URL", INVALID_MESSAGE);
  }

  let ref: string | undefined;

  if (segments[2] === "tree" && segments.length > 3) {
    ref = segments.slice(3).join("/");

    if (!REF.test(ref) || ref.split("/").some((part) => part === "..")) {
      throw new GitHubError("INVALID_GITHUB_URL", "That branch name is not valid.");
    }
  }

  return { owner, repo, ref };
}
