import path from "node:path";

import type {
  RepositoryFile,
  RepositoryMetadata,
} from "../../types/repository.js";

import type {
  AnalysisContext,
  ContextFile,
  FileContext,
} from "./context.types.js";
import { rankFiles } from "./file-ranking.js";

/**
 * Approximate prompt characters used by a file section's header
 * and separators, on top of the file content itself.
 */
const FILE_SECTION_OVERHEAD_CHARS = 120;

const EXCLUDED_FILES = new Set([
  "LICENSE",
  "LICENSE.md",
  "CHANGELOG.md",
]);

function isExcludedFile(fileName: string): boolean {
  return EXCLUDED_FILES.has(fileName);
}

function getLanguage(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();

  switch (extension) {
    case ".ts":
      return "TypeScript";

    case ".tsx":
      return "TypeScript React";

    case ".js":
      return "JavaScript";

    case ".jsx":
      return "JavaScript React";

    case ".py":
      return "Python";

    case ".java":
      return "Java";

    case ".cpp":
    case ".cc":
    case ".cxx":
      return "C++";

    case ".c":
      return "C";

    case ".cs":
      return "C#";

    case ".go":
      return "Go";

    case ".rs":
      return "Rust";

    case ".php":
      return "PHP";

    case ".rb":
      return "Ruby";

    case ".swift":
      return "Swift";

    case ".kt":
      return "Kotlin";

    case ".html":
      return "HTML";

    case ".css":
      return "CSS";

    case ".scss":
      return "SCSS";

    case ".json":
      return "JSON";

    case ".md":
      return "Markdown";

    case ".xml":
      return "XML";

    case ".yaml":
    case ".yml":
      return "YAML";

    case ".sql":
      return "SQL";

    case ".sh":
      return "Shell";

    default:
      return "Text";
  }
}

function toContextFile(file: RepositoryFile): ContextFile {
  return {
    path: file.relativePath,
    language: getLanguage(file.relativePath),
    content: file.content,
    truncated: file.truncated,
  };
}

function getImportantDirectories(
  files: RepositoryFile[],
): string[] {
  const directories = new Set<string>();

  for (const file of files) {
    const directory = path.dirname(file.relativePath);

    if (directory !== ".") {
      directories.add(directory);
    }
  }

  return [...directories].sort();
}

/**
 * Picks files in ranked order until the character budget is used.
 * A file that does not fit is skipped, so smaller files after it
 * can still be included.
 */
function selectFiles(
  files: RepositoryFile[],
  fileCharBudget: number,
): FileContext {
  const ranked = rankFiles(
    files.filter((file) => !isExcludedFile(file.name)),
  );

  const included: ContextFile[] = [];
  const omittedFiles: string[] = [];

  let remaining = fileCharBudget;

  for (const file of ranked) {
    const cost =
      file.content.length +
      file.relativePath.length +
      FILE_SECTION_OVERHEAD_CHARS;

    if (cost <= remaining) {
      included.push(toContextFile(file));
      remaining -= cost;
    } else {
      omittedFiles.push(file.relativePath);
    }
  }

  return {
    files: included,
    omittedFiles,
    totalFiles: ranked.length,
  };
}

/**
 * Builds the model's view of the repository.
 *
 * @param fileCharBudget characters available for file contents.
 */
export function buildAnalysisContext(
  metadata: RepositoryMetadata,
  fileCharBudget: number,
): AnalysisContext {
  const repository = {
    name: metadata.repositoryName,
    totalFiles: metadata.totalFiles,
    totalDirectories: metadata.totalDirectories,
  };

  const technologies = {
    languages: [...metadata.languages],
    frameworks: [...metadata.frameworks],
  };

  const structure = {
    configurationFiles: [
      ...metadata.configurationFiles,
    ],
    importantDirectories: getImportantDirectories(
      metadata.repository.files,
    ),
  };

  const files = selectFiles(
    metadata.repository.files,
    Math.max(0, fileCharBudget),
  );

  const metrics = metadata.metrics;

  const staticAnalysis =
    metadata.staticAnalysis;

  const evidence = metadata.evidence;

  return {
    repository,
    technologies,
    structure,

    metrics,
    staticAnalysis,
    evidence,
    files,
  };
}