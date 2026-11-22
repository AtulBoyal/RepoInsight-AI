export interface GenerationTrace {
  startedAt: string;
  finishedAt: string;
  durationMs: number;

  model: string;

  promptCharacters: number;
  responseCharacters: number;

  /**
   * Token counts reported by Gemini, summed over the main call
   * and any repair call. Undefined if Gemini did not report them.
   */
  promptTokens?: number;
  outputTokens?: number;

  /**
   * Files sent to the model vs. files that passed filtering.
   */
  filesIncluded: number;
  filesAvailable: number;

  repaired: boolean;
  repairAttempts: number;
}
