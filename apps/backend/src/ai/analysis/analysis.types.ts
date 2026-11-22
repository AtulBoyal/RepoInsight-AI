import type { RepositoryMetadata } from "../../types/repository.js";
import type { EngineeringReport } from "../report/report.types.js";
import type { GenerationTrace } from "../trace/trace.types.js";
import type { RepositoryInfo } from "../../types/repository-info.js";

export interface AnalysisRequest {
  metadata: RepositoryMetadata;
  /** Shown in the Markdown report header. */
  repository?: RepositoryInfo;
}

export interface AnalysisResult {
  report: EngineeringReport;
  markdown: string;
  trace: GenerationTrace;
}