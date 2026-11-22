import type { LoggingAnalysis } from "./analysis.types.js";
import type { SourceFacts } from "./source-facts.js";

export function buildLoggingAnalysis(facts: SourceFacts): LoggingAnalysis {
  const count = (type: SourceFacts["logging"][number]["type"]) =>
    facts.logging.filter((fact) => fact.type === type).length;

  return {
    consoleLogCount: count("console.log"),
    consoleErrorCount: count("console.error"),
    consoleWarnCount: count("console.warn"),
    debuggerCount: count("debugger"),
    processExitCount: count("process.exit"),
  };
}
