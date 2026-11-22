import { z } from "zod";

import { engineeringReportSchema } from "./report.schema.js";

/**
 * JSON Schema for Gemini structured output, generated from the Zod
 * schema. `io: "input"` describes what the model must send (before
 * transforms such as score rounding). `$schema` is dropped because
 * Gemini does not need it.
 */
const { $schema: _ignored, ...jsonSchema } = z.toJSONSchema(
  engineeringReportSchema,
  { io: "input" },
);

export const ENGINEERING_REPORT_JSON_SCHEMA = jsonSchema;
