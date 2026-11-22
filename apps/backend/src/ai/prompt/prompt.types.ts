export interface PromptSpec {
  systemInstruction: string;
  userInstruction: string;

  responseMimeType: "application/json";

  /**
   * JSON Schema the model's output must follow (Gemini structured
   * output). Generated from the Zod schema, so it cannot drift.
   */
  responseJsonSchema?: unknown;
}
