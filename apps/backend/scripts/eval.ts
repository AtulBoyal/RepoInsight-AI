/**
 * Runs the real analysis pipeline several times on the same ZIP(s)
 * and reports how much the results vary between runs.
 *
 * Calls the real Gemini API (costs money): runs are sequential.
 *
 *   npx tsx scripts/eval.ts [--runs 3] repo1.zip [repo2.zip ...]
 *
 * Optional: GEMINI_TEMPERATURE=0.2 npx tsx scripts/eval.ts ...
 * Results are also written to eval-results/<timestamp>.json.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { processRepository } from "../src/repository/repository-processor.service.js";
import { analyzeRepository } from "../src/ai/analysis/ai-analysis.service.js";
import { JobLogger } from "../src/logger/logger.service.js";
import { env } from "../src/config/env.js";
import type { JobContext } from "../src/jobs/job.types.js";

interface RunResult {
  repository: string;
  run: number;
  ok: boolean;
  error?: string;
  durationMs?: number;
  folderStructure?: number;
  codeQuality?: number;
  resume?: number;
  strengths?: number;
  weaknesses?: number;
  improvements?: number;
  citations?: number;
  citationsVerified?: number;
  citationsDropped?: number;
  promptTokens?: number;
  outputTokens?: number;
  repaired?: boolean;
  weaknessTitles?: string[];
}

function parseArgs(argv: string[]) {
  let runs = 3;
  const zips: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--runs") {
      runs = Number(argv[++i]);
    } else {
      zips.push(argv[i]);
    }
  }

  if (zips.length === 0 || !Number.isInteger(runs) || runs < 1) {
    console.error("Usage: npx tsx scripts/eval.ts [--runs 3] repo.zip [more.zip ...]");
    process.exit(1);
  }

  return { runs, zips };
}

async function runOnce(zip: string, run: number): Promise<RunResult> {
  const repository = path.basename(zip);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "eval-"));
  const job: JobContext = {
    id: `eval-${run}`,
    logger: new JobLogger(`eval-${repository}-${run}`),
    setStage: () => {},
  };

  try {
    // processRepository extracts from the ZIP but does not delete it.
    const metadata = await processRepository(path.resolve(zip), dir, job);
    const { report, trace } = await analyzeRepository({ metadata }, job);

    return {
      repository,
      run,
      ok: true,
      durationMs: trace.durationMs,
      folderStructure: report.folderStructure.score,
      codeQuality: report.codeQuality.score,
      resume: report.resumeFeedback.score,
      strengths: report.strengths.length,
      weaknesses: report.weaknesses.length,
      improvements: report.improvements.length,
      citations: trace.citations.total,
      citationsVerified: trace.citations.verified,
      citationsDropped: trace.citations.dropped,
      promptTokens: trace.promptTokens,
      outputTokens: trace.outputTokens,
      repaired: trace.repaired,
      weaknessTitles: report.weaknesses.map((w) => w.title),
    };
  } catch (error) {
    return {
      repository,
      run,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function summarize(values: number[]): string {
  if (values.length === 0) return "-";

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const spread = Math.max(...values) - Math.min(...values);

  return `${mean.toFixed(1)} (${Math.min(...values)}–${Math.max(...values)}, spread ${spread})`;
}

async function main() {
  const { runs, zips } = parseArgs(process.argv.slice(2));

  console.log(
    `Model ${env.GEMINI_MODEL}, temperature ${env.GEMINI_TEMPERATURE ?? "default"}, ${runs} run(s) per repository\n`,
  );

  const results: RunResult[] = [];

  for (const zip of zips) {
    for (let run = 1; run <= runs; run++) {
      process.stdout.write(`${path.basename(zip)} run ${run}/${runs}... `);
      const result = await runOnce(zip, run);
      results.push(result);
      console.log(
        result.ok
          ? `scores ${result.folderStructure}/${result.codeQuality}/${result.resume}, ${result.citationsVerified}/${result.citations} citations verified, ${((result.durationMs ?? 0) / 1000).toFixed(0)}s`
          : `FAILED: ${result.error}`,
      );
    }
  }

  console.log("\n=== Summary (mean, range, spread) ===");

  for (const zip of zips) {
    const repo = path.basename(zip);
    const ok = results.filter((r) => r.repository === repo && r.ok);
    const pick = (key: keyof RunResult) => ok.map((r) => r[key] as number);

    console.log(`\n${repo}: ${ok.length}/${runs} runs succeeded`);
    console.log(`  Folder structure score: ${summarize(pick("folderStructure"))}`);
    console.log(`  Code quality score:     ${summarize(pick("codeQuality"))}`);
    console.log(`  Resume score:           ${summarize(pick("resume"))}`);
    console.log(`  Weaknesses found:       ${summarize(pick("weaknesses"))}`);
    console.log(`  Citations verified:     ${summarize(pick("citationsVerified"))} of ${summarize(pick("citations"))}`);
    console.log(`  Citations dropped:      ${summarize(pick("citationsDropped"))}`);
    console.log(`  Repaired responses:     ${ok.filter((r) => r.repaired).length}`);

    // Weakness titles that appear in every run are the stable findings.
    const titleCounts = new Map<string, number>();
    for (const r of ok) {
      for (const title of new Set(r.weaknessTitles?.map((t) => t.toLowerCase()))) {
        titleCounts.set(title, (titleCounts.get(title) ?? 0) + 1);
      }
    }
    const stable = [...titleCounts].filter(([, n]) => n === ok.length).map(([t]) => t);
    console.log(`  Weaknesses in every run: ${stable.length ? stable.join("; ") : "none (titles vary)"}`);
  }

  const outDir = path.join(process.cwd(), "eval-results");
  await fs.mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, `${new Date().toISOString().replace(/:/g, "-")}.json`);
  await fs.writeFile(
    outFile,
    JSON.stringify(
      { model: env.GEMINI_MODEL, temperature: env.GEMINI_TEMPERATURE ?? null, runs, results },
      null,
      2,
    ),
  );
  console.log(`\nSaved ${outFile}`);
}

await main();
