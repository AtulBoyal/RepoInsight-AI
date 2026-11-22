export type GitHubErrorCode =
  | "INVALID_GITHUB_URL"
  | "GITHUB_REPO_NOT_FOUND"
  | "GITHUB_REPO_PRIVATE"
  | "GITHUB_REF_NOT_FOUND"
  | "GITHUB_REPO_TOO_LARGE"
  | "GITHUB_RATE_LIMITED"
  | "GITHUB_UNAVAILABLE";

const STATUS: Record<GitHubErrorCode, number> = {
  INVALID_GITHUB_URL: 400,
  GITHUB_REPO_NOT_FOUND: 404,
  GITHUB_REPO_PRIVATE: 403,
  GITHUB_REF_NOT_FOUND: 404,
  GITHUB_REPO_TOO_LARGE: 413,
  GITHUB_RATE_LIMITED: 503,
  GITHUB_UNAVAILABLE: 502,
};

/**
 * A problem with a GitHub URL or with fetching the repository.
 * The message is shown to the user as is.
 */
export class GitHubError extends Error {
  readonly code: GitHubErrorCode;

  readonly status: number;

  constructor(code: GitHubErrorCode, message: string) {
    super(message);

    this.name = "GitHubError";
    this.code = code;
    this.status = STATUS[code];
  }
}
