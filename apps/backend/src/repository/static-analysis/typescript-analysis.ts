import type { TypeScriptAnalysis } from "./analysis.types.js";
import type { SourceFacts } from "./source-facts.js";

export function buildTypeScriptAnalysis(
  facts: SourceFacts,
): TypeScriptAnalysis {
  const count = (type: SourceFacts["typescript"][number]["type"]) =>
    facts.typescript.filter((fact) => fact.type === type).length;

  return {
    anyUsages: count("any"),
    typeAssertions: count("type-assertion"),
    tsIgnoreCount: count("ts-ignore"),
    eslintDisableCount: count("eslint-disable"),
  };
}
