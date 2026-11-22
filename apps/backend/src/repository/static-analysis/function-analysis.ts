import type { FunctionAnalysis } from "./analysis.types.js";
import type { SourceFacts } from "./source-facts.js";

/**
 * Function statistics for JavaScript/TypeScript, from parsed source.
 * Counts functions and methods with a block body (one-line arrow
 * callbacks such as `x => x.id` are not counted).
 */
export function buildFunctionAnalysis(facts: SourceFacts): FunctionAnalysis {
  const lengths = facts.functions.map((fn) => fn.length);

  const total = lengths.length;

  return {
    totalFunctions: total,
    averageFunctionLength:
      total === 0
        ? 0
        : Number((lengths.reduce((sum, n) => sum + n, 0) / total).toFixed(1)),
    longestFunctionLines: total === 0 ? 0 : Math.max(...lengths),
    functionsOver50Lines: lengths.filter((n) => n > 50).length,
    functionsOver100Lines: lengths.filter((n) => n > 100).length,
  };
}
