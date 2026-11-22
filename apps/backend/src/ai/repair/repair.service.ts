import { generateContent, type GenerationOutput } from "../gemini/gemini.client.js";

import { buildRepairPrompt } from "./repair.prompt.js";

export async function repairResponse(
  invalidResponse: string,
  validationError: string,
): Promise<GenerationOutput> {
  return generateContent(
    buildRepairPrompt({
      invalidResponse,
      validationError,
    }),
  );
}
