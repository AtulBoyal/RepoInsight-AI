/**
 * Report types are inferred from the backend's Zod schema
 * (copied by `npm run sync:schema`), so they cannot drift apart.
 */
export type {
  EngineeringReport,
  EvidenceReference,
  Finding,
  Improvement,
  InterviewQuestion,
} from "./report.schema.generated";

import type { EngineeringReport } from "./report.schema.generated";

/**
 * Which repository a report is about.
 */
export interface RepositoryInfo {
  /** "owner/repo" for GitHub, the ZIP's file name for uploads. */
  name: string;
  url?: string;
  ref?: string;
  commitSha?: string;
}

export interface AnalyzeRepositoryResponse {
  report: EngineeringReport;
  markdown: string;
  repository: RepositoryInfo;
  /** When the analysis ran (ISO 8601). */
  analyzedAt: string;
  /** True when the same input was analyzed before and the report reused. */
  cached: boolean;
}
