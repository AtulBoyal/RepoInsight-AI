import type { RepositoryEvidence } from "../../repository/evidence/evidence.types.js";
import type { RepositoryMetrics } from "../../repository/metrics/metrics.types.js";
import type { StaticAnalysis } from "../../repository/static-analysis/analysis.types.js";

export interface AnalysisContext {
  repository: RepositoryContext;
  technologies: TechnologyContext;
  structure: StructureContext;
  metrics: RepositoryMetrics;
  staticAnalysis: StaticAnalysis;
  evidence: RepositoryEvidence;
  files: FileContext;
}

export interface RepositoryContext {
  name: string;
  totalFiles: number;
  totalDirectories: number;
}

export interface TechnologyContext {
  languages: string[];
  frameworks: string[];
}

export interface StructureContext {
  configurationFiles: string[];
  importantDirectories: string[];
}

export interface ContextFile {
  path: string;
  language: string;
  content: string;
  truncated: boolean;
}

export interface FileContext {
  /**
   * Files whose content is included in the prompt, in ranked order.
   */
  files: ContextFile[];

  /**
   * Paths of analyzable files left out to stay within the budget.
   */
  omittedFiles: string[];

  /**
   * Number of files that passed filtering (included + omitted).
   */
  totalFiles: number;
}
