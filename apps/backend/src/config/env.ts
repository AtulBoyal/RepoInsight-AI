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