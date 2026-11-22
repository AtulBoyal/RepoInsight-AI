import path from "node:path";

import type { RepositoryFile } from "../../types/repository.js";
import type { TypeScriptAnalysis } from "./analysis.types.js";
import { matchTypeScriptLine } from "./typescript-patterns.js";

const SUPPORTED_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
]);

export function buildTypeScriptAnalysis(
  files: RepositoryFile[],
): TypeScriptAnalysis {
  const counters: TypeScriptAnalysis = {
    anyUsages: 0,
    typeAssertions: 0,
    tsIgnoreCount: 0,
    eslintDisableCount: 0,
  };

  for (const file of files) {
    const extension = path.extname(
      file.relativePath,
    ).toLowerCase();

    if (!SUPPORTED_EXTENSIONS.has(extension)) {
      continue;
    }

    for (const line of file.content.split(/\r?\n/)) {
      for (const match of matchTypeScriptLine(line)) {
        switch (match) {
          case "any":
            counters.anyUsages++;
            break;
          case "type-assertion":
            counters.typeAssertions++;
            break;
          case "ts-ignore":
            counters.tsIgnoreCount++;
            break;
          case "eslint-disable":
            counters.eslintDisableCount++;
            break;
        }
      }
    }
  }

  return counters;
}
