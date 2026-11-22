import fs from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";

import { createZip, tempDir } from "./helpers/zip.js";
import type { PromptSpec } from "../src/ai/prompt/prompt.types.js";

vi.mock("../src/ai/gemini/gemini.client.js", () => ({
  generateContent: vi.fn(),
}));

const { generateContent } = await import("../src/ai/gemini/gemini.client.js");
const { processRepository } = await import(
  "../src/repository/repository-processor.service.js"
);
const { analyzeRepository } = await import(
  "../src/ai/analysis/ai-analysis.service.js"
);
const { JobLogger } = await import("../src/logger/logger.service.js");

const mockedGenerate = vi.mocked(generateContent);

function modelReport() {
  const section = { score: 6.6, positives: [], negatives: [], recommendations: [] };

  return {
    summary: { purpose: "Demo", description: "A demo repository." },
    technologyStack: { languages: ["TypeScript"], frameworks: [], databases: [], tools: [], infrastructure: [] },
    architecture: { summary: "s", strengths: [], weaknesses: [], scalability: "x", maintainability: "y" },
    folderStructure: section,
    codeQuality: section,
    strengths: [],
    weaknesses: [
      {
        title: "Unsafe exit",
        description: "Calls process.exit",
        evidence: [
          { file: "src/index.ts", line: 2, description: "Uses `process.exit`" },
          { file: "Repository Metrics", description: "not a file" },
        ],
      },
    ],
    improvements: [],
    resumeFeedback: { score: 7, summary: "s", strengths: [], improvements: [], bestResumeBullets: [] },
    interviewQuestions: [],
  };
}

async function runPipeline() {
  const zip = await createZip([
    { name: "demo/package.json", content: '{"dependencies":{"express":"^5"}}' },
    { name: "demo/src/index.ts", content: "const port = 5000;\nprocess.exit(1);\n" },
  ]);
  const dir = await tempDir();
  const stages: string[] = [];
  const job = {
    id: "test",
    logger: new JobLogger("test"),
    setStage: (stage: string) => stages.push(stage),
  };

  try {
    const metadata = await processRepository(zip, dir, job as never);
    const result = await analyzeRepository({ metadata }, job as never);

    return { result, stages };
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

describe("analysis pipeline", () => {
  it("repairs invalid JSON, rounds scores and checks citations", async () => {
    mockedGenerate.mockReset();
    mockedGenerate
      .mockResolvedValueOnce({ text: "{ not json", promptTokens: 100, outputTokens: 5 })
      .mockResolvedValueOnce({
        text: JSON.stringify(modelReport()),
        promptTokens: 50,
        outputTokens: 40,
      });

    const { result, stages } = await runPipeline();

    expect(mockedGenerate).toHaveBeenCalledTimes(2);
    expect(result.trace.repaired).toBe(true);
    expect(result.trace.promptTokens).toBe(150);
    expect(result.report.codeQuality.score).toBe(7);

    // The invented "Repository Metrics" citation is removed;
    // the real one gets the actual code.
    const evidence = result.report.weaknesses[0].evidence;
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({ file: "src/index.ts", line: 2 });
    expect(evidence[0].snippet?.lines).toContain("process.exit(1);");
    expect(result.trace.citations).toMatchObject({ total: 2, verified: 1, dropped: 1 });

    expect(stages).toEqual([
      "EXTRACTING",
      "READING_REPOSITORY",
      "STATIC_ANALYSIS",
      "BUILDING_AI_CONTEXT",
      "AI_REVIEW",
      "VALIDATING_RESPONSE",
      "GENERATING_MARKDOWN",
    ]);
  });

  it("sends numbered source lines and the response schema to Gemini", async () => {
    mockedGenerate.mockReset();
    mockedGenerate.mockResolvedValue({ text: JSON.stringify(modelReport()) });

    await runPipeline();

    const prompt = mockedGenerate.mock.calls[0][0] as PromptSpec;

    expect(prompt.userInstruction).toContain("Showing 2 of 2 analyzable files");
    expect(prompt.userInstruction).toContain("2| process.exit(1);");
    expect(prompt.userInstruction).toContain("process.exit");
    expect(prompt.responseJsonSchema).toMatchObject({
      type: "object",
      required: expect.arrayContaining(["summary", "weaknesses"]),
    });
  });
});
