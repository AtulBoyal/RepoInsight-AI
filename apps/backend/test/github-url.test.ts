import { describe, expect, it } from "vitest";

import { parseGitHubUrl } from "../src/github/github-url.js";
import { GitHubError } from "../src/github/github.errors.js";

describe("parseGitHubUrl", () => {
  it.each([
    ["https://github.com/AtulBoyal/RepoInsight-AI", undefined],
    ["https://github.com/AtulBoyal/RepoInsight-AI/", undefined],
    ["https://github.com/AtulBoyal/RepoInsight-AI.git", undefined],
    ["http://www.github.com/AtulBoyal/RepoInsight-AI", undefined],
    ["github.com/AtulBoyal/RepoInsight-AI", undefined],
    ["AtulBoyal/RepoInsight-AI", undefined],
    ["  https://github.com/AtulBoyal/RepoInsight-AI  ", undefined],
    ["https://github.com/AtulBoyal/RepoInsight-AI/tree/main", "main"],
    ["https://github.com/AtulBoyal/RepoInsight-AI/tree/feature/login", "feature/login"],
    ["https://github.com/AtulBoyal/RepoInsight-AI?tab=readme", undefined],
  ])("accepts %s", (input, ref) => {
    expect(parseGitHubUrl(input)).toEqual({
      owner: "AtulBoyal",
      repo: "RepoInsight-AI",
      ref,
    });
  });

  it("ignores pages inside a repository other than /tree/<ref>", () => {
    expect(
      parseGitHubUrl("https://github.com/owner/repo/issues/12"),
    ).toEqual({ owner: "owner", repo: "repo", ref: undefined });
  });

  it.each([
    "",
    "https://gitlab.com/owner/repo",
    "https://github.com.evil.example/owner/repo",
    "https://github.com/owner",
    "https://github.com/../etc/passwd",
    "https://github.com/owner/repo/tree/../../x",
    "https://github.com/-bad/repo",
    "https://github.com/owner/re po",
    "not a url at all",
    "file:///etc/passwd",
  ])("rejects %j", (input) => {
    expect(() => parseGitHubUrl(input)).toThrow(GitHubError);
  });
});
