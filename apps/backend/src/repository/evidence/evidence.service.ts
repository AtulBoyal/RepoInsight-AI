import type { RepositoryFile } from "../../types/repository.js";

import type { RepositoryEvidence } from "./evidence.types.js";

import { buildAnnotationEvidence } from "../static-analysis/todo-evidence.js";
import type { SourceFacts } from "../static-analysis/source-facts.js";

/**
 * Builds complete repository evidence.
 *
 * Unlike repository metrics, evidence contains exact
 * locations inside the repository which can later be
 * referenced by the AI while generating explanations.
 */
export function buildRepositoryEvidence(
  files: RepositoryFile[],
  facts: SourceFacts,
): RepositoryEvidence {
  return {
    // Longest first: the prompt shows the top entries.
    functions: [...facts.functions].sort((a, b) => b.length - a.length),
    logging: facts.logging,
    typescript: facts.typescript,
    annotations: buildAnnotationEvidence(files),
  };
}
