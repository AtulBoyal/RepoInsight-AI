import { modelReportSchema } from "../report/report.schema.js";

import type { ModelReport } from "../report/report.types.js";

/**
 * Validates the model's report. Throws a ZodError when invalid.
 */
export function validateModelReport(data: unknown): ModelReport {
  return modelReportSchema.parse(data);
}
