import fs from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";

import { createZip } from "./helpers/zip.js";

vi.mock("../src/ai/gemini/gemini.client.js", () => ({
  generateContent: vi.fn(),
}));

vi.mock("../src/github/github.client.js", () => ({
  resolveRepository: vi.fn(),
  downloadRepositoryZip: vi.fn(),
}));

const { generateContent } = await import("../src/ai/gemini/gemini.client.js");
const { downloadRepositoryZip } = await import("../src/github/github.client.js");
const { runAnalysisJob } = await import("../src/application/analysis-job.runner.js");
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

const repository = {
  fullName: "Owner/Repo",
  owner: "Owner",
  repo: "Repo",
  ref: "main",
  commitSha: "e".repeat(40),
  htmlUrl: "https://github.com/Owner/Repo",
};

describe("GitHub analysis job", () => {
  it("downloads, analyzes and labels the report with the repository and commit", async () => {
    // GitHub zipballs wrap everything in "<owner>-<repo>-<sha>/".
    const fixture = await createZip([
      { name: "Owner-Repo-eeeeeee/src/index.ts", content: "export const a = 1;\n" },
    ]);

    vi.mocked(downloadRepositoryZip).mockImplementation(async (_repo, destination) => {
      await fs.copyFile(fixture, destination);
    });
    vi.mocked(generateContent).mockResolvedValue({ text: JSON.stringify(report) });

    const job = jobStore.create();
    const stages: string[] = [];
    const unsubscribe = jobStore.subscribe(job.id, (current) => {
      stages.push(current.progress.stage);
    });

    await runAnalysisJob(job.id, { type: "github", repository });
    unsubscribe();

    const result = jobStore.get(job.id);

    expect(result?.status).toBe("completed");
    expect(result?.result?.repository).toEqual({
      name: "Owner/Repo",
      url: "https://github.com/Owner/Repo",
      ref: "main",
      commitSha: "e".repeat(40),
    });
    expect(result?.result?.markdown).toContain(
      "**Repository:** [Owner/Repo](https://github.com/Owner/Repo) · `main` @ `eeeeeee`",
    );
    expect(stages[0]).toBe("DOWNLOADING");

    // The prompt names the repository, not the temp folder.
    const prompt = vi.mocked(generateContent).mock.calls[0][0];
    expect(prompt.userInstruction).toContain("Name: Owner/Repo");

    // The downloaded ZIP is deleted afterwards.
    const destination = vi.mocked(downloadRepositoryZip).mock.calls[0][1];
    await expect(fs.stat(destination)).rejects.toThrow();
  });

  it("fails the job with GitHub's error when the download fails", async () => {
    const { GitHubError } = await import("../src/github/github.errors.js");

    vi.mocked(downloadRepositoryZip).mockRejectedValueOnce(
      new GitHubError("GITHUB_REPO_TOO_LARGE", "Owner/Repo is larger than the 500 MB download limit."),
    );

    const job = jobStore.create();

    await runAnalysisJob(job.id, { type: "github", repository });

    expect(jobStore.get(job.id)?.error).toEqual({
      status: 413,
      body: {
        success: false,
        error: "GITHUB_REPO_TOO_LARGE",
        message: "Owner/Repo is larger than the 500 MB download limit.",
      },
    });
  });
});
