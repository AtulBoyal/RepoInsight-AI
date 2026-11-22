import { describe, expect, it } from "vitest";

import { MemoryReportStore } from "../src/cache/report-store.js";
import { ReportCache, githubCacheKey } from "../src/cache/report-cache.js";
import { jobStore } from "../src/jobs/job.store.js";
import type { JobResult } from "../src/jobs/job.types.js";

function result(name: string): JobResult {
  return {
    report: {} as never,
    markdown: `# ${name}`,
    repository: { name },
    analyzedAt: "2026-11-22T00:00:00.000Z",
    cached: false,
  };
}

describe("MemoryReportStore", () => {
  it("evicts the least recently used entry when full", async () => {
    const store = new MemoryReportStore(2, 60_000);

    await store.set("a", result("a"));
    await store.set("b", result("b"));
    await store.get("a"); // "a" is now more recent than "b"
    await store.set("c", result("c"));

    expect(await store.get("a")).toBeDefined();
    expect(await store.get("b")).toBeUndefined();
    expect(await store.get("c")).toBeDefined();
  });

  it("expires entries after their time limit", async () => {
    let now = 1_000;
    const store = new MemoryReportStore(10, 500, () => now);

    await store.set("a", result("a"));
    now = 1_400;
    expect(await store.get("a")).toBeDefined();

    now = 1_501;
    expect(await store.get("a")).toBeUndefined();
    expect(store.size).toBe(0);
  });

  it("stores nothing when the size is 0 (caching off)", async () => {
    const store = new MemoryReportStore(0, 60_000);

    await store.set("a", result("a"));

    expect(await store.get("a")).toBeUndefined();
  });
});

describe("ReportCache", () => {
  const store = new MemoryReportStore(10, 60_000);

  it("lets identical requests join a running job, until it finishes", () => {
    const cache = new ReportCache(() => store);
    const job = jobStore.create();

    cache.track("key", job.id);
    expect(cache.runningJob("key")).toBe(job.id);

    jobStore.complete(job.id, result("done"));
    expect(cache.runningJob("key")).toBeUndefined();
  });

  it("only releases the job it was tracking", () => {
    const cache = new ReportCache(() => store);
    const newer = jobStore.create();

    cache.track("key", newer.id);
    cache.release("key", "an-older-job-id");

    expect(cache.runningJob("key")).toBe(newer.id);
  });

  it("keys GitHub reports by repository and exact commit", () => {
    expect(githubCacheKey("Owner/Repo", "abc")).toBe(githubCacheKey("owner/repo", "abc"));
    expect(githubCacheKey("owner/repo", "abc")).not.toBe(githubCacheKey("owner/fork", "abc"));
    expect(githubCacheKey("owner/repo", "abc")).not.toBe(githubCacheKey("owner/repo", "def"));
  });
});
