/**
 * Report types are inferred from the Zod schema, so the
 * runtime validation and the static types cannot drift apart.
 */
export type {
  EngineeringReport,
  EvidenceReference,
  Finding,
  Improvement,
  InterviewQuestion,
} from "./report.schema.js";
