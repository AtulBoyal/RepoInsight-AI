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

export interface AnalyzeRepositoryResponse {
  report: EngineeringReport;
  markdown: string;
}
