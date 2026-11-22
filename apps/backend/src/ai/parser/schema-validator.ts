import { engineeringReportSchema } from "../report/report.schema.js";

import type { EngineeringReport } from "../report/report.types.js";

/**
 * Validates an EngineeringReport. Throws a ZodError when invalid.
 */
export function validateEngineeringReport(
  data: unknown,
): EngineeringReport {
  return engineeringReportSchema.parse(data);
}
