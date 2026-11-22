import { describe, expect, it } from "vitest";

import { jobStore } from "../src/jobs/job.store.js";

const report = {} as never;

describe("jobStore", () => {
  it("keeps each job's progress separate", () => {
    const a = jobStore.create();
    const b = jobStore.create();

    jobStore.setStage(a.id, "AI_REVIEW");

    expect(jobStore.get(a.id)?.progress.stage).toBe("AI_REVIEW");
    expect(jobStore.get(b.id)?.progress.stage).toBe("UPLOADING");
  });

  it("notifies subscribers until they unsubscribe", () => {
    const job = jobStore.create();
    const stages: string[] = [];

    const unsubscribe = jobStore.subscribe(job.id, (current) =>
      stages.push(current.progress.stage),
    );

    jobStore.setStage(job.id, "EXTRACTING");
    unsubscribe();
    jobStore.setStage(job.id, "READING_REPOSITORY");

    expect(stages).toEqual(["EXTRACTING"]);
  });

  it("does not change a job after it has finished", () => {
    const job = jobStore.create();

    jobStore.complete(job.id, {
      report,
      markdown: "# done",
      repository: { name: "demo" },
    });
    jobStore.fail(job.id, {
      status: 500,
      body: { success: false, error: "X", message: "late failure" },
    });
    jobStore.setStage(job.id, "AI_REVIEW");

    const current = jobStore.get(job.id);

    expect(current?.status).toBe("completed");
    expect(current?.progress.stage).toBe("COMPLETED");
    expect(current?.error).toBeUndefined();
  });

  it("counts only running jobs", () => {
    const before = jobStore.runningCount();
    const job = jobStore.create();

    expect(jobStore.runningCount()).toBe(before + 1);

    jobStore.fail(job.id, {
      status: 400,
      body: { success: false, error: "X", message: "failed" },
    });

    expect(jobStore.runningCount()).toBe(before);
  });
});
