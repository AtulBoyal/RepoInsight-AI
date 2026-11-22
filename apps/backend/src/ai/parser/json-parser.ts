/**
 * Parses LLM JSON responses, keeping the parser's
 * error detail so the repair prompt can use it.
 */
export function parseJson(
  response: string,
): unknown {
  try {
    return JSON.parse(response);
  } catch (error) {
    throw new Error(
      `Invalid JSON: ${
        error instanceof Error ? error.message : "parse failed"
      }`,
    );
  }
}
