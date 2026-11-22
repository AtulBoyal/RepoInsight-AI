import type { RepairRequest } from "./repair.types.js";
import type { PromptSpec } from "../prompt/prompt.types.js";
import { ENGINEERING_REPORT_JSON_SCHEMA } from "../report/report.json-schema.js";

export function buildRepairPrompt(
  request: RepairRequest,
): PromptSpec {
  return {
    systemInstruction: [
      "You repair JSON documents so they match a required schema.",
      "Keep the original content. Only fix structure, types and missing fields.",
      "Return only the corrected JSON.",
    ].join("\n"),

    userInstruction: [
      "The previous response failed validation.",
      "",
      "Validation error:",
      request.validationError,
      "",
      "Previous response:",
      request.invalidResponse,
    ].join("\n"),

    responseMimeType: "application/json",

    responseJsonSchema: ENGINEERING_REPORT_JSON_SCHEMA,
  };
}
