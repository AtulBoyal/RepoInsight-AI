import type { AnalysisContext, ContextFile } from "../context/context.types.js";
import type { PromptSpec } from "./prompt.types.js";
import { SYSTEM_INSTRUCTION, ANALYSIS_TASK, REPORT_REQUIREMENTS } from "./prompt.constants.js";
import { ENGINEERING_REPORT_JSON_SCHEMA } from "../report/report.json-schema.js";
import { MAX_FILE_CONTENT_CHARS } from "../../constants/repository.js";

/**
 * Objective repository measurements.
 */
function buildMetricsSection(
  context: AnalysisContext,
): string {
  const { code, languages, directories, documentation, annotations } =
    context.metrics;

  const languageLines = [...languages]
    .sort((a, b) => b.linesOfCode - a.linesOfCode)
    .slice(0, 8)
    .map(
      (language) =>
        `${language.language}: ${language.files} files, ${language.linesOfCode} lines`,
    );

  return [
    "## Repository Metrics",
    "",
    `(Line counts cover at most the first ${MAX_FILE_CONTENT_CHARS} characters of each file.)`,
    "",
    `Lines: ${code.totalLinesOfCode} total, ${code.sourceLinesOfCode} source, ${code.commentLines} comment, ${code.blankLines} blank`,
    "",
    "Languages by lines:",
    formatList(languageLines),
    "",
    `Directories: ${directories.totalDirectories} (max depth ${directories.maximumDepth}, deepest: ${directories.deepestDirectory}, most files: ${directories.largestDirectory} with ${directories.largestDirectoryFileCount})`,
    "",
    "Documentation files:",
    formatList([
      ...documentation.readmeFiles,
      ...documentation.changelogFiles,
      ...documentation.contributingFiles,
      ...documentation.licenseFiles,
    ]),
    "",
    `Annotations: ${annotations.todoCount} TODO, ${annotations.fixmeCount} FIXME, ${annotations.hackCount} HACK, ${annotations.xxxCount} XXX`,
  ].join("\n");
}

/**
 * Heuristic static-analysis counts.
 */
function buildStaticAnalysisSection(
  context: AnalysisContext,
): string {
  const { functions, typescript, logging, tests, duplicates } =
    context.staticAnalysis;

  return [
    "## Static Analysis",
    "",
    "These counts come from lightweight pattern matching and are approximate.",
    "Verify against the source files before citing a specific number.",
    "",
    `Functions (JavaScript/TypeScript only): ${functions.totalFunctions} detected, average ${functions.averageFunctionLength} lines, longest ${functions.longestFunctionLines} lines, ${functions.functionsOver50Lines} over 50 lines, ${functions.functionsOver100Lines} over 100 lines`,
    "",
    `TypeScript: ${typescript.anyUsages} "any", ${typescript.typeAssertions} type assertions (excluding "as const"), ${typescript.tsIgnoreCount} @ts-ignore, ${typescript.eslintDisableCount} eslint-disable`,
    "",
    `Logging: ${logging.consoleLogCount} console.log, ${logging.consoleWarnCount} console.warn, ${logging.consoleErrorCount} console.error, ${logging.debuggerCount} debugger, ${logging.processExitCount} process.exit`,
    "",
    `Tests: ${tests.testFiles} test files for ${tests.sourceFiles} source files (${tests.testCoverageRatio} test files per 100 source files — this is NOT code coverage)`,
    `Test frameworks declared: ${[tests.hasJest && "Jest", tests.hasVitest && "Vitest"].filter(Boolean).join(", ") || "none detected (only Jest/Vitest are checked)"}`,
    "",
    `Duplicate file names: ${duplicates.duplicateFileCount} (conventional names such as index.ts or __init__.py are expected to repeat)`,
  ].join("\n");
}

function buildEvidenceSection(
  context: AnalysisContext,
): string {
  const lines: string[] = [];

  lines.push("## Repository Evidence");
  lines.push("");

  lines.push(
    `Large Functions: ${context.evidence.functions.length}`,
  );

  for (const fn of context.evidence.functions.slice(0, 10)) {
    lines.push(
      `- ${fn.file}:${fn.line} (${fn.length} LOC) ${fn.name}`,
    );
  }

  lines.push("");

  lines.push(
    `Logging Statements: ${context.evidence.logging.length}`,
  );

  for (const log of context.evidence.logging.slice(0, 10)) {
    lines.push(
      `- ${log.file}:${log.line} (${log.type})`,
    );
  }

  lines.push("");

  lines.push(
    `TypeScript Issues: ${context.evidence.typescript.length}`,
  );

  for (const issue of context.evidence.typescript.slice(0, 10)) {
    lines.push(
      `- ${issue.file}:${issue.line} (${issue.type})`,
    );
  }

  lines.push("");

  lines.push(
    `Engineering Notes: ${context.evidence.annotations.length}`,
  );

  for (const note of context.evidence.annotations.slice(0, 10)) {
    lines.push(
      `- ${note.file}:${note.line} (${note.type}) ${note.text}`,
    );
  }

  return lines.join("\n");
}

/**
 * Formats a list of strings into a bullet list.
 */
function formatList(items: string[]): string {
  if (items.length === 0) {
    return "- None";
  }

  return items.map((item) => `- ${item}`).join("\n");
}

/**
 * Builds the repository summary section.
 */
function buildRepositorySection(context: AnalysisContext): string {
  return [
    "## Repository",
    "",
    `Name: ${context.repository.name}`,
    `Total Files: ${context.repository.totalFiles}`,
    `Total Directories: ${context.repository.totalDirectories}`,
  ].join("\n");
}

/**
 * Builds the technology section.
 */
function buildTechnologySection(context: AnalysisContext): string {
  return [
    "## Technology Stack",
    "",
    "Languages:",
    formatList(context.technologies.languages),
    "",
    "Frameworks:",
    formatList(context.technologies.frameworks),
  ].join("\n");
}

/**
 * Builds the project structure section.
 */
function buildStructureSection(context: AnalysisContext): string {
  return [
    "## Project Structure",
    "",
    "Configuration Files:",
    formatList(context.structure.configurationFiles),
    "",
    "Important Directories:",
    formatList(context.structure.importantDirectories),
  ].join("\n");
}

/**
 * Formats a single source file.
 */
function buildFileSection(file: ContextFile): string {
  return [
    "===== FILE =====",
    `Path: ${file.path}`,
    `Language: ${file.language}`,
    ...(file.truncated
      ? [
          `Note: truncated to the first ${MAX_FILE_CONTENT_CHARS} characters; the rest of this file is not shown.`,
        ]
      : []),
    "",
    file.content.trim(),
    "===== END FILE =====",
  ].join("\n");
}

const MAX_OMITTED_PATHS = 300;

/**
 * Lists files left out of the prompt, so the model knows they exist.
 */
function buildOmittedFilesSection(paths: string[]): string {
  const shown = paths.slice(0, MAX_OMITTED_PATHS);

  return [
    "## Files Not Included",
    "",
    `${paths.length} analyzable files were left out to fit the prompt budget.`,
    "",
    ...shown.map((filePath) => `- ${filePath}`),
    ...(paths.length > shown.length
      ? [`- ... and ${paths.length - shown.length} more`]
      : []),
  ].join("\n");
}

/**
 * Builds the complete user prompt.
 */
function buildUserPrompt(context: AnalysisContext): string {
  const sections: string[] = [];

  sections.push(ANALYSIS_TASK);

  sections.push(REPORT_REQUIREMENTS);

  sections.push(buildRepositorySection(context));

  sections.push(buildTechnologySection(context));

  sections.push(buildStructureSection(context));

  sections.push(buildMetricsSection(context));

  sections.push(buildStaticAnalysisSection(context));

  sections.push(buildEvidenceSection(context));

  sections.push(`
    ## Review Methodology

    Evaluate the repository in this order:

    1. Repository Metrics

    2. Static Analysis

    3. Repository Evidence

    4. Source Files

    If any information conflicts:

    Trust the source files over heuristic counts.

    Never infer missing features.

    Never guess architecture.

    Never invent technologies.

    If evidence is insufficient:

    State that explicitly.
  `);

  sections.push(
    [
      "## Output Rules",
      "",
      "Return one JSON object that follows the response schema.",
      "All scores are integers from 0 to 10.",
      "Only cite files and line numbers from the Source Files section below.",
      "Files listed under Files Not Included were not shown to you: you may mention",
      "that they exist, but do not describe or cite their contents.",
    ].join("\n"),
  );

  sections.push(
    [
      "## Source Files",
      "",
      `Showing ${context.files.files.length} of ${context.files.totalFiles} analyzable files, ordered by importance.`,
    ].join("\n"),
  );

  if (context.files.files.length === 0) {
    sections.push("No source files were selected for analysis.");
  } else {
    sections.push(
      context.files.files
        .map(buildFileSection)
        .join("\n\n"),
    );
  }

  if (context.files.omittedFiles.length > 0) {
    sections.push(buildOmittedFilesSection(context.files.omittedFiles));
  }

  sections.push(
    [
      "## Resume Review Guidelines",
      "",
      "Score conservatively.",
      "An average student project should score around 6–7.",
      "Well-designed academic projects around 7–8.",
      "Strong production-quality portfolio projects around 8–9.",
      "Reserve 10 only for truly exceptional engineering.",
      "",
      "Consider:",
      "",
      "- Architecture",
      "- Code Quality",
      "- Engineering Practices",
      "- Documentation",
      "- Testing",
      "- Complexity",
      "- Resume Value",
      "",
      "Do not inflate the score.",
    ].join("\n"),
  );

  sections.push(
    [
      "## Interview Question Guidelines",
      "",
      "Questions should be derived directly from repository decisions.",
      "",
      "Prioritize, where the repository gives material for them:",
      "",
      "- Architecture and module boundaries",
      "- Language and framework features of the detected stack",
      "- Data flow and state management",
      "- Error handling",
      "- Security",
      "- Testing strategy",
      "- Design trade-offs",
      "",
      "Only ask about topics that actually appear in this repository.",
      "",
      "Avoid generic DSA questions.",
      "",
      "Each expected answer should explain the engineering reasoning rather than simply stating facts.",
    ].join("\n"),
  );

  sections.push(
    [
      "## Final Validation",
      "",
      "Before returning the JSON:",
      "",
      "✓ Validate every required field exists.",
      "",
      "✓ Validate nested objects exist.",
      "",
      "✓ Validate arrays contain the correct object type.",
      "",
      "✓ Validate evidence references are consistent.",
      "",
      "✓ Validate recommendations are supported by evidence.",
      "",
      "✓ Validate no unsupported claims exist.",
      "",
      "✓ Validate JSON syntax.",
      "",
      "Return exactly one JSON object.",
    ].join("\n"),
  );

  return sections.join("\n\n");
}

/**
 * Builds the prompt sent to the LLM.
 */
export function buildPrompt(
  context: AnalysisContext,
): PromptSpec {
  return {
    systemInstruction: SYSTEM_INSTRUCTION.trim(),
    userInstruction: buildUserPrompt(context).trim(),
    responseMimeType: "application/json",
    responseJsonSchema: ENGINEERING_REPORT_JSON_SCHEMA,
  };
}