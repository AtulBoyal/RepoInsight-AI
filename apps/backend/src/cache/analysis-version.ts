import { createHash } from "node:crypto";

import { env } from "../config/env.js";
import {
  ANALYSIS_TASK,
  REPORT_REQUIREMENTS,
  SYSTEM_INSTRUCTION,
} from "../ai/prompt/prompt.constants.js";
import { ENGINEERING_REPORT_JSON_SCHEMA } from "../ai/report/report.json-schema.js";

/**
 * Bump when the pipeline changes in a way the fingerprint below cannot
 * see (e.g. how files are ranked, filtered or formatted in the prompt),
 * so cached reports from the old pipeline are no longer reused.
 */
const PIPELINE_REVISION = 1;

/**
 * Fingerprint of everything that shapes a report: model, settings,
 * prompt text, output schema and pipeline revision. Part of every cache
 * key, so changing any of them makes old cached reports stop matching.
 */
export const ANALYSIS_VERSION = createHash("sha256")
  .update(
    JSON.stringify({
      revision: PIPELINE_REVISION,
      model: env.GEMINI_MODEL,
      temperature: env.GEMINI_TEMPERATURE ?? null,
      maxPromptTokens: env.MAX_PROMPT_TOKENS,
      prompt: [SYSTEM_INSTRUCTION, ANALYSIS_TASK, REPORT_REQUIREMENTS],
      schema: ENGINEERING_REPORT_JSON_SCHEMA,
    }),
  )
  .digest("hex")
  .slice(0, 12);
