import path from "node:path";

import type { RepositoryFile } from "../../types/repository.js";
import type { TypeScriptEvidence } from "./evidence.types.js";
import { matchTypeScriptLine } from "../static-analysis/typescript-patterns.js";

const SUPPORTED_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
]);

/**
 * Extracts TypeScript-specific evidence from the repository.
 */
export function buildTypeScriptEvidence(
  files: RepositoryFile[],
): TypeScriptEvidence[] {
  const evidence: TypeScriptEvidence[] = [];

  for (const file of files) {
    const extension = path
      .extname(file.relativePath)
      .toLowerCase();

    if (!SUPPORTED_EXTENSIONS.has(extension)) {
      continue;
    }

    const lines = file.content.split(/\r?\n/);

    for (
      let index = 0;
      index < lines.length;
      index++
    ) {
      const line = lines[index];

      for (const type of matchTypeScriptLine(line)) {
        evidence.push({
          file: file.relativePath,
          line: index + 1,
          type,
        });
      }
    }
  }

  return evidence;
}