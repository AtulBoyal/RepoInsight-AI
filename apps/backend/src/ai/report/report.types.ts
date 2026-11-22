/**
 * Report types are inferred from the Zod schema, so the
 * runtime validation and the static types cannot drift apart.
 */
export type {
  EngineeringReport,
  EvidenceReference,
  EvidenceSnippet,
  Finding,
  Improvement,
  InterviewQuestion,
  ModelReport,
} from "./report.schema.js";
