import path from "node:path";

import type { RepositoryFile } from "../../types/repository.js";
import type { TestAnalysis } from "./analysis.types.js";

const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".java",
  ".py",
  ".go",
  ".rs",
  ".cpp",
  ".c",
  ".cs",
  ".kt",
  ".rb",
  ".php",
  ".mjs",
  ".cjs",
]);

function isSourceFile(file: RepositoryFile): boolean {
  const extension = path.extname(
    file.relativePath,
  ).toLowerCase();

  return SOURCE_EXTENSIONS.has(extension);
}

const TEST_DIRECTORY_SEGMENTS = new Set([
  "__tests__",
  "test",
  "tests",
  "spec",
]);

/**
 * Recognizes common test-file conventions across languages:
 * JS/TS (*.test.ts, *.spec.ts, __tests__/), Python (test_*.py, *_test.py),
 * Go (*_test.go), Java/Kotlin/C# (*Test.java, *Tests.cs), and
 * test/ or tests/ directories.
 */
function isTestFile(file: RepositoryFile): boolean {
  if (!isSourceFile(file)) {
    return false;
  }

  const segments = file.relativePath.toLowerCase().split(path.sep);
  const fileName = path.basename(file.relativePath);
  const stem = fileName.slice(0, fileName.length - path.extname(fileName).length);

  return (
    segments.slice(0, -1).some((segment) => TEST_DIRECTORY_SEGMENTS.has(segment)) ||
    /\.(test|spec)$/i.test(stem) ||
    /^test_/i.test(stem) ||
    /_test$/i.test(stem) ||
    /(Test|Tests|Spec)$/.test(stem)
  );
}

export function buildTestAnalysis(
  files: RepositoryFile[],
): TestAnalysis {
  let sourceFiles = 0;

  let testFiles = 0;

  let hasJest = false;

  let hasVitest = false;

  for (const file of files) {
    if (isTestFile(file)) {
      testFiles++;
    } else if (isSourceFile(file)) {
      sourceFiles++;
    }

    if (
      file.name === "package.json" &&
      file.content.includes("jest")
    ) {
      hasJest = true;
    }

    if (
      file.name === "package.json" &&
      file.content.includes("vitest")
    ) {
      hasVitest = true;
    }
  }

  const testCoverageRatio =
    sourceFiles === 0
      ? 0
      : Number(
          (
            (testFiles / sourceFiles) *
            100
          ).toFixed(1),
        );

  return {
    sourceFiles,
    testFiles,
    testCoverageRatio,
    hasJest,
    hasVitest,
  };
}