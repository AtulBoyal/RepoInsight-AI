import "dotenv/config";

import { z } from "zod";

const envSchema = z.object({
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  /**
   * When true, the full prompt (which contains the user's source code),
   * the raw model response and the report are written to the log folder.
   * Keep this off in production.
   */
  /**
   * Analyses allowed to run at the same time. Further uploads get
   * HTTP 429 until one finishes. Protects memory and Gemini spend.
   */
  MAX_CONCURRENT_JOBS: z.coerce.number().int().min(1).default(2),
  /**
   * Upper bound on the prompt size sent to Gemini. Source files are
   * ranked by importance and added until this budget is reached.
   */
  MAX_PROMPT_TOKENS: z.coerce.number().int().min(10_000).default(150_000),
  SAVE_DEBUG_ARTIFACTS: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "❌ Invalid environment variables:\n",
    parsed.error.flatten().fieldErrors,
  );

  process.exit(1);
}

export const env = parsed.data;