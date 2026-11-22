import type { ContextFile } from "../context/context.types.js";
import type {
  EngineeringReport,
  EvidenceReference,
  ModelReport,
} from "../report/report.types.js";

/**
 * Lines of context shown above and below a cited line.
 */
const SNIPPET_RADIUS = 2;

const MAX_SNIPPET_LINE_CHARS = 300;

/**
 * How far a cited line may be moved to reach the code it describes.
 */
const SNAP_RADIUS = 5;

export interface GroundingStats {
  /** Citations the model produced. */
  total: number;
  /** File and line exist in what the model was shown; snippet attached. */
  verified: number;
  /** Of the verified, how many were moved to the line holding the quoted code. */
  adjusted: number;
  /** File exists, but the line was missing or out of range (line removed). */
  fileOnly: number;
  /** File not found among the files shown to the model (citation removed). */
  dropped: number;
}

interface ShownFile {
  path: string;
  lines: string[];
}

type ModelEvidence = ModelReport["strengths"][number]["evidence"][number];

/**
 * Resolves a path written by the model to a file it was shown.
 */
class PathResolver {
  private readonly byPath = new Map<string, ShownFile>();

  constructor(files: ContextFile[]) {
    for (const file of files) {
      this.byPath.set(file.path.replaceAll("\\", "/"), {
        path: file.path,
        lines: file.content.split(/\r?\n/),
      });
    }
  }

  resolve(rawPath: string): ShownFile | undefined {
    const normalized = rawPath
      .trim()
      .replace(/^`+|`+$/g, "")
      .replaceAll("\\", "/")
      .replace(/^\.?\//, "");

    if (!normalized) {
      return undefined;
    }

    const exact = this.byPath.get(normalized);

    if (exact) {
      return exact;
    }

    // The model sometimes prefixes the repository name or a parent
    // folder ("myrepo/src/app.ts"): drop leading segments.
    const segments = normalized.split("/");

    for (let i = 1; i < segments.length; i++) {
      const candidate = this.byPath.get(segments.slice(i).join("/"));

      if (candidate) {
        return candidate;
      }
    }

    // Or it shortens the path ("app.ts" for "src/app.ts"): accept a
    // suffix match only when it is unambiguous.
    const suffixMatches = [...this.byPath.entries()].filter(([path]) =>
      path.endsWith(`/${normalized}`),
    );

    return suffixMatches.length === 1 ? suffixMatches[0][1] : undefined;
  }
}

/**
 * Splits "src/app.ts:42" into a path and a line number.
 */
function splitEmbeddedLine(
  file: string,
  line: number | undefined,
): { file: string; line: number | undefined } {
  const match = file.match(/^(.*?):(\d+)(?:-\d+)?$/);

  if (match && line === undefined) {
    return { file: match[1], line: Number(match[2]) };
  }

  return { file: match ? match[1] : file, line };
}

/**
 * Text the description quotes from the code: `backticked code`, or a
 * 'quoted phrase' / "quoted phrase" (matched by its first 24 chars).
 */
function quotedCode(description: string): string[] {
  const code = [...description.matchAll(/`([^`]{3,80})`/g)].map((match) =>
    match[1].replace(/\(\)$/, "").trim(),
  );

  const phrases = [
    ...description.matchAll(/(?:^|[\s:(])['"]([^'"]{8,200})['"]/g),
  ].map((match) => match[1].trim().slice(0, 24));

  return [...code, ...phrases].filter((token) => token.length >= 3);
}

/**
 * Moves a cited line to the nearest line (within SNAP_RADIUS) that
 * contains code quoted in the description, if the cited line does not.
 * Models are often off by a few lines.
 */
function snapToQuotedCode(
  lines: string[],
  line: number,
  description: string,
): number {
  const tokens = quotedCode(description);

  const matches = (lineNumber: number) =>
    tokens.some((token) => lines[lineNumber - 1]?.includes(token));

  if (tokens.length === 0 || matches(line)) {
    return line;
  }

  for (let distance = 1; distance <= SNAP_RADIUS; distance++) {
    for (const candidate of [line - distance, line + distance]) {
      if (candidate >= 1 && candidate <= lines.length && matches(candidate)) {
        return candidate;
      }
    }
  }

  return line;
}

function buildSnippet(
  lines: string[],
  line: number,
): EvidenceReference["snippet"] {
  const start = Math.max(1, line - SNIPPET_RADIUS);
  const end = Math.min(lines.length, line + SNIPPET_RADIUS);

  return {
    startLine: start,
    lines: lines
      .slice(start - 1, end)
      .map((text) =>
        text.length > MAX_SNIPPET_LINE_CHARS
          ? `${text.slice(0, MAX_SNIPPET_LINE_CHARS)}…`
          : text,
      ),
  };
}

/**
 * Checks every citation in the model's report against the files the
 * model was actually shown:
 *
 * - unknown files are removed (they would be hallucinated references)
 * - out-of-range lines are removed, keeping the file reference
 * - valid lines get a snippet of the real code around them
 * - paths are rewritten to the exact repository path
 */
export function groundReport(
  report: ModelReport,
  shownFiles: ContextFile[],
): { report: EngineeringReport; stats: GroundingStats } {
  const resolver = new PathResolver(shownFiles);

  const stats: GroundingStats = {
    total: 0,
    verified: 0,
    adjusted: 0,
    fileOnly: 0,
    dropped: 0,
  };

  const groundEvidence = (
    evidence: ModelEvidence[],
  ): EvidenceReference[] => {
    const result: EvidenceReference[] = [];
    const seen = new Set<string>();

    for (const item of evidence) {
      const { file, line } = splitEmbeddedLine(item.file, item.line);
      const shown = resolver.resolve(file);

      if (!shown) {
        stats.dropped++;
        continue;
      }

      const inRange =
        line !== undefined &&
        Number.isInteger(line) &&
        line >= 1 &&
        line <= shown.lines.length;

      const validLine = inRange
        ? snapToQuotedCode(shown.lines, line, item.description)
        : undefined;

      const key = `${shown.path}:${validLine ?? ""}:${item.description}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);

      if (validLine === undefined) {
        stats.fileOnly++;
        result.push({ file: shown.path, description: item.description });
        continue;
      }

      stats.verified++;

      if (validLine !== line) {
        stats.adjusted++;
      }
      result.push({
        file: shown.path,
        line: validLine,
        description: item.description,
        snippet: buildSnippet(shown.lines, validLine),
      });
    }

    return result;
  };

  const grounded: EngineeringReport = {
      ...report,
      strengths: report.strengths.map((finding) => ({
        ...finding,
        evidence: groundEvidence(finding.evidence),
      })),
      weaknesses: report.weaknesses.map((finding) => ({
        ...finding,
        evidence: groundEvidence(finding.evidence),
      })),
      improvements: report.improvements.map((improvement) => ({
        ...improvement,
        evidence: groundEvidence(improvement.evidence),
      })),
  };

  // Exact duplicates are merged silently and not counted.
  stats.total = stats.verified + stats.fileOnly + stats.dropped;

  return { report: grounded, stats };
}
