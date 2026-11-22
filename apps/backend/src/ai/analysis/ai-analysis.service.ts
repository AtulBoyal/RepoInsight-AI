import { ZodError } from "zod";
import { buildAnalysisContext } from "../context/context.service.js";
import { generateContent } from "../gemini/gemini.client.js";
import { cleanJson } from "../parser/json-cleaner.js";
import { parseJson } from "../parser/json-parser.js";
import { validateEngineeringReport } from "../parser/schema-validator.js";
import { buildPrompt } from "../prompt/prompt.builder.js";
import { repairResponse } from "../repair/repair.service.js";
import { buildMarkdown } from "../report/markdown.service.js";
import { buildGenerationTrace } from "../trace/trace.service.js";
import { progressService } from "../../progress/progress.service.js";
import { env } from "../../config/env.js";
import { logger } from "../../logger/logger.service.js";

import type { EngineeringReport } from "../report/report.types.js";
import type {
  AnalysisRequest,
  AnalysisResult,
} from "./analysis.types.js";

/**
 * Cleans, parses and validates a raw model response.
 * Throws on invalid JSON or schema mismatch.
 */
function toReport(rawResponse: string): EngineeringReport {
  return validateEngineeringReport(
    parseJson(cleanJson(rawResponse)),
  );
}

function describeError(error: unknown): string {
  if (error instanceof ZodError) {
    return JSON.stringify(error.flatten(), null, 2);
  }

  return error instanceof Error
    ? error.message
    : "Unknown validation error";
}

export async function analyzeRepository(
  request: AnalysisRequest,
): Promise<AnalysisResult> {
  const startedAt = Date.now();

  progressService.setStage("BUILDING_AI_CONTEXT");

  const context = buildAnalysisContext(request.metadata);

  const prompt = buildPrompt(context);

  await logger.info("AI context built");

  progressService.setStage("AI_REVIEW");

  await logger.prompt(prompt.userInstruction);

  const rawResponse = await generateContent(prompt);

  await logger.geminiResponse(rawResponse);

  progressService.setStage("VALIDATING_RESPONSE");

  let report: EngineeringReport;
  let finalResponse = rawResponse;
  let repairAttempts = 0;

  try {
    report = toReport(rawResponse);
  } catch (validationError) {
    // Covers both invalid JSON and schema mismatches.
    await logger.warn(
      "Model response invalid. Attempting repair.",
      describeError(validationError),
    );

    repairAttempts = 1;

    finalResponse = await repairResponse(
      cleanJson(rawResponse),
      describeError(validationError),
    );

    report = toReport(finalResponse);
  }

  await logger.validatedReport(report);

  progressService.setStage("GENERATING_MARKDOWN");

  const markdown = buildMarkdown(report);

  await logger.markdown(markdown);

  const trace = buildGenerationTrace({
    startedAt,
    prompt: prompt.userInstruction,
    response: finalResponse,
    repaired: repairAttempts > 0,
    repairAttempts,
    model: env.GEMINI_MODEL,
  });

  await logger.info("Analysis completed", trace);

  return {
    report,
    markdown,
    trace,
  };
}
