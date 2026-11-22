import { GoogleGenAI } from "@google/genai";

import { env } from "../../config/env.js";
import type { PromptSpec } from "../prompt/prompt.types.js";

const client = new GoogleGenAI({
  apiKey: env.GEMINI_API_KEY,
});

const MAX_RETRIES = 3;

export interface GenerationOutput {
  text: string;
  promptTokens?: number;
  outputTokens?: number;
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) =>
    setTimeout(resolve, ms),
  );
}

/**
 * Generates raw JSON text from Gemini.
 *
 * Retries temporary failures (429 / 5xx) with linear backoff.
 * Other failures (e.g. 400 when the prompt is too large) fail fast.
 */
export async function generateContent(
  prompt: PromptSpec,
): Promise<GenerationOutput> {
  for (
    let attempt = 1;
    attempt <= MAX_RETRIES;
    attempt++
  ) {
    try {
      const response =
        await client.models.generateContent({
          model: env.GEMINI_MODEL,
          contents: prompt.userInstruction,
          config: {
            systemInstruction:
              prompt.systemInstruction,
            responseMimeType:
              prompt.responseMimeType,
            responseJsonSchema:
              prompt.responseJsonSchema,
            temperature: env.GEMINI_TEMPERATURE,
          },
        });

      const text = response.text;

      if (!text) {
        throw new Error(
          "Gemini returned an empty response.",
        );
      }

      return {
        text: text.trim(),
        promptTokens: response.usageMetadata?.promptTokenCount,
        outputTokens: response.usageMetadata?.candidatesTokenCount,
      };
    } catch (error) {
      const status =
        (error as { status?: number }).status;

      console.error(
        `Gemini attempt ${attempt}/${MAX_RETRIES} failed` +
          (status ? ` (status ${status})` : ""),
        error instanceof Error ? error.message : error,
      );

      if (status !== undefined && !RETRYABLE_STATUSES.has(status)) {
        throw new Error(
          `Gemini rejected the request (status ${status}). ` +
            "The repository may be too large to review in one request.",
        );
      }

      if (attempt === MAX_RETRIES) {
        break;
      }

      await sleep(attempt * 2000);
    }
  }

  throw new Error(
    "Gemini is temporarily unavailable. Please try again in a few moments.",
  );
}
