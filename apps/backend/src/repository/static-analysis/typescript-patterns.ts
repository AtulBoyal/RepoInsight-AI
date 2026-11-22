/**
 * Line-level TypeScript patterns shared by the static analysis
 * (counts) and the evidence builder (locations).
 *
 * These are heuristics, not a parser. They aim to avoid the most
 * common false positives:
 * - the English word "any" in comments or strings
 * - `as` in import/export aliases (`import * as fs`, `{ a as b }`)
 * - `as const`, which is a safe literal narrowing, not an unsafe cast
 */
export type TypeScriptPatternType =
  | "any"
  | "type-assertion"
  | "ts-ignore"
  | "eslint-disable";

const ANY_TYPE = /(:\s*any\b|\bas\s+any\b|<any\b|\bany\[\]|\bany\s*[|&>,)])/;

const TYPE_ASSERTION = /\bas\s+(?!const\b)[A-Za-z_${[(]/;

const IMPORT_EXPORT_LINE = /^\s*(import|export\s*(\*|\{))/;

const COMMENT_LINE = /^\s*(\/\/|\*|\/\*)/;

export function matchTypeScriptLine(
  line: string,
): TypeScriptPatternType[] {
  const matches: TypeScriptPatternType[] = [];

  if (/@ts-ignore/.test(line)) {
    matches.push("ts-ignore");
  }

  if (/eslint-disable/.test(line)) {
    matches.push("eslint-disable");
  }

  if (COMMENT_LINE.test(line)) {
    return matches;
  }

  if (ANY_TYPE.test(line)) {
    matches.push("any");
  }

  if (
    !IMPORT_EXPORT_LINE.test(line) &&
    TYPE_ASSERTION.test(line)
  ) {
    matches.push("type-assertion");
  }

  return matches;
}
