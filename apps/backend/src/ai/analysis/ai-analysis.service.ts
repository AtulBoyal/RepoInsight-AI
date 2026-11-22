import { ZodError } from "zod";
import { buildAnalysisContext } from "../context/context.service.js";
import { generateContent } from "../gemini/gemini.client.js";
import { cleanJson } from "../parser/json-cleaner.js";
import { parseJson } from "../parser/json-parser.js";
import { validateModelReport } from "../parser/schema-validator.js";
import { groundReport } from "../grounding/grounding.service.js";
import { buildPrompt } from "../prompt/prompt.builder.js";
import { repairResponse } from "../repair/repair.service.js";
import { buildMarkdown } from "../report/markdown.service.js";
import { buildGenerationTrace } from "../trace/trace.service.js";
import { env } from "../../config/env.js";

import type { ModelReport } from "../report/report.types.js";
import type { JobContext } from "../../jobs/job.types.js";
import type {
  AnalysisRequest,
  AnalysisResult,
} from "./analysis.types.js";

/**
 * Conservative characters-per-token estimate for source code.
 * Real counts are reported by Gemini afterwards (see the trace).
 */
const CHARS_PER_TOKEN = 3;

/**
 * Space kept free for the omitted-files list and estimate error.
 */
const BUDGET_RESERVE_CHARS = 20_000;

/**
 * Cleans, parses and validates a raw model response.
 * Throws on invalid JSON or schema mismatch.
 */
function toReport(rawResponse: string): ModelReport {
  return validateModelReport(
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

function addTokens(
  a: number | undefined,
  b: number | undefined,
): number | undefined {
  return a === undefined && b === undefined
    ? undefined
    : (a ?? 0) + (b ?? 0);
}

/**
 * Characters available for file contents: the total budget minus
 * everything else in the prompt (measured with no files included).
 */
function computeFileCharBudget(
  metadata: AnalysisRequest["metadata"],
): number {
  const emptyPrompt = buildPrompt(buildAnalysisContext(metadata, 0));

  const fixedChars =
    emptyPrompt.systemInstruction.length +
    emptyPrompt.userInstruction.length;

  return (
    env.MAX_PROMPT_TOKENS * CHARS_PER_TOKEN -
    fixedChars -
    BUDGET_RESERVE_CHARS
  );
}

export async function analyzeRepository(
  request: AnalysisRequest,
  job: JobContext,
): Promise<AnalysisResult> {
  const startedAt = Date.now();

  job.setStage("BUILDING_AI_CONTEXT");

  const context = buildAnalysisContext(
    request.metadata,
    computeFileCharBudget(request.metadata),
  );

  const prompt = buildPrompt(context);

  await job.logger.info("AI context built", {
    filesIncluded: context.files.files.length,
    filesAvailable: context.files.totalFiles,
    promptCharacters: prompt.userInstruction.length,
  });

  job.setStage("AI_REVIEW");

  await job.logger.prompt(prompt.userInstruction);

  const generation = await generateContent(prompt);

  await job.logger.geminiResponse(generation.text);

  job.setStage("VALIDATING_RESPONSE");

  let modelReport: ModelReport;
  let finalResponse = generation.text;
  let promptTokens = generation.promptTokens;
  let outputTokens = generation.outputTokens;
  let repairAttempts = 0;

  try {
    modelReport = toReport(generation.text);
  } catch (validationError) {
    // Covers both invalid JSON and schema mismatches.
    await job.logger.warn(
      "Model response invalid. Attempting repair.",
      describeError(validationError),
    );

    repairAttempts = 1;

    const repair = await repairResponse(
      cleanJson(generation.text),
      describeError(validationError),
    );

    finalResponse = repair.text;
    promptTokens = addTokens(promptTokens, repair.promptTokens);
    outputTokens = addTokens(outputTokens, repair.outputTokens);

    modelReport = toReport(finalResponse);
  }

  // Remove invented citations; attach real code to valid ones.
  const { report, stats: citations } = groundReport(
    modelReport,
    context.files.files,
  );

  await job.logger.info("Citations checked", citations);

  await job.logger.validatedReport(report);

  job.setStage("GENERATING_MARKDOWN");

  const markdown = buildMarkdown(report, request.repository);

  await job.logger.markdown(markdown);

  const trace = buildGenerationTrace({
    startedAt,
    model: env.GEMINI_MODEL,
    promptCharacters: prompt.userInstruction.length,
    responseCharacters: finalResponse.length,
    promptTokens,
    outputTokens,
    filesIncluded: context.files.files.length,
    filesAvailable: context.files.totalFiles,
    citations,
    repaired: repairAttempts > 0,
    repairAttempts,
  });

  return {
    report,
    markdown,
    trace,
  };
}
