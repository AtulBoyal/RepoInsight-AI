import { FileCode } from "lucide-react";

import type { EvidenceReference } from "../../types/report";

interface Props {
  evidence: EvidenceReference[];
}

/**
 * Citations checked by the backend. Entries with a snippet show the
 * real code around the cited line; the cited line is highlighted.
 */
export default function EvidenceList({ evidence }: Props) {
  if (evidence.length === 0) {
    return null;
  }

  return (
    <ul className="mt-3 space-y-2">
      {evidence.map((item, index) => {
        const location = item.line ? `${item.file}:${item.line}` : item.file;

        const label = (
          <span className="inline-flex flex-wrap items-baseline gap-x-2">
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
              {location}
            </code>
            <span className="text-sm text-slate-600">{item.description}</span>
          </span>
        );

        if (!item.snippet) {
          return (
            <li key={`${location}-${index}`} className="flex gap-2">
              <FileCode className="mt-0.5 shrink-0 text-slate-400" size={16} />
              {label}
            </li>
          );
        }

        const { startLine, lines } = item.snippet;

        return (
          <li key={`${location}-${index}`}>
            <details className="group">
              <summary className="flex cursor-pointer list-none gap-2">
                <FileCode className="mt-0.5 shrink-0 text-blue-500" size={16} />
                {label}
              </summary>

              <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 py-2 text-xs leading-5 text-slate-100">
                {lines.map((text, lineIndex) => {
                  const lineNumber = startLine + lineIndex;
                  const cited = lineNumber === item.line;

                  return (
                    <div
                      key={lineNumber}
                      className={cited ? "bg-blue-500/25" : undefined}
                    >
                      <span className="inline-block w-12 select-none pr-3 text-right text-slate-500">
                        {lineNumber}
                      </span>
                      <span className="pr-3">{text}</span>
                    </div>
                  );
                })}
              </pre>
            </details>
          </li>
        );
      })}
    </ul>
  );
}
