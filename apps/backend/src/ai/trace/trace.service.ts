import type { GenerationTrace } from "./trace.types.js";

type TraceOptions = Omit<
  GenerationTrace,
  "startedAt" | "finishedAt" | "durationMs"
> & {
  startedAt: number;
};

export function buildGenerationTrace(
  options: TraceOptions,
): GenerationTrace {
  const finishedAt = Date.now();

  return {
    ...options,
    startedAt: new Date(options.startedAt).toISOString(),
    finishedAt: new Date(finishedAt).toISOString(),
    durationMs: finishedAt - options.startedAt,
  };
}
