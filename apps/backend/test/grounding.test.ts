import { describe, expect, it } from "vitest";

import { groundReport } from "../src/ai/grounding/grounding.service.js";
import type { ContextFile } from "../src/ai/context/context.types.js";
import type { ModelReport } from "../src/ai/report/report.types.js";

const files: ContextFile[] = [
  {
    path: "src/routes/analyze.ts",
    language: "TypeScript",
    truncated: false,
    content: [
      "import { Router } from 'express';",
      "",
      "const router = Router();",
      "",
      "router.post('/analyze', (req, res) => {",
      "  if (jobStore.runningCount() >= MAX) {",
      "    return res.status(429).end();",
      "  }",
      "});",
    ].join("\n"),
  },
  {
    path: "src/server.ts",
    language: "TypeScript",
    truncated: false,
    content: "app.listen(5000);",
  },
];

type Evidence = ModelReport["strengths"][number]["evidence"];

function reportWith(evidence: Evidence): ModelReport {
  const empty = { score: 7, positives: [], negatives: [], recommendations: [] };

  return {
    summary: { purpose: "", description: "" },
    technologyStack: { languages: [], frameworks: [], databases: [], tools: [], infrastructure: [] },
    architecture: { summary: "", strengths: [], weaknesses: [], scalability: "", maintainability: "" },
    folderStructure: empty,
    codeQuality: empty,
    strengths: [{ title: "t", description: "d", evidence }],
    weaknesses: [],
    improvements: [],
    resumeFeedback: { score: 7, summary: "", strengths: [], improvements: [], bestResumeBullets: [] },
    interviewQuestions: [],
  };
}

function ground(evidence: Evidence) {
  const { report, stats } = groundReport(reportWith(evidence), files);
  return { evidence: report.strengths[0].evidence, stats };
}

describe("groundReport", () => {
  it("drops citations of files the model was not shown", () => {
    const { evidence, stats } = ground([
      { file: "Repository Metrics", description: "section name" },
      { file: "src/missing.ts", line: 3, description: "invented" },
    ]);

    expect(evidence).toEqual([]);
    expect(stats).toMatchObject({ total: 2, dropped: 2 });
  });

  it("attaches the real code around a valid line", () => {
    const { evidence, stats } = ground([
      { file: "src/routes/analyze.ts", line: 3, description: "router" },
    ]);

    expect(evidence[0].snippet).toEqual({
      startLine: 1,
      lines: [
        "import { Router } from 'express';",
        "",
        "const router = Router();",
        "",
        "router.post('/analyze', (req, res) => {",
      ],
    });
    expect(stats.verified).toBe(1);
  });

  it("keeps the file but removes an out-of-range line", () => {
    const { evidence, stats } = ground([
      { file: "src/server.ts", line: 99, description: "too far" },
    ]);

    expect(evidence).toEqual([{ file: "src/server.ts", description: "too far" }]);
    expect(stats.fileOnly).toBe(1);
  });

  it("moves an off-by-a-few line to the code quoted in the description", () => {
    const { evidence, stats } = ground([
      {
        file: "src/routes/analyze.ts",
        line: 8,
        description: "Checks `jobStore.runningCount()` against the cap",
      },
    ]);

    expect(evidence[0].line).toBe(6);
    expect(stats.adjusted).toBe(1);
  });

  it("normalizes paths the model writes differently", () => {
    const { evidence } = ground([
      { file: "./src/server.ts", description: "dot slash" },
      { file: "myrepo/src/server.ts", description: "repo prefix" },
      { file: "server.ts", description: "unique suffix" },
      { file: "src/routes/analyze.ts:5", description: "embedded line" },
      { file: "`src\\server.ts`", description: "backticks and backslash" },
    ]);

    expect(evidence.map((item) => [item.file, item.line])).toEqual([
      ["src/server.ts", undefined],
      ["src/server.ts", undefined],
      ["src/server.ts", undefined],
      ["src/routes/analyze.ts", 5],
      ["src/server.ts", undefined],
    ]);
  });
});
