import fs from "node:fs/promises";
import path from "node:path";

import { env } from "../config/env.js";
import { LOG_DIRECTORY } from "./logger.constants.js";

import type { LogEntry } from "./logger.types.js";

function serialize(data: unknown): unknown {
  if (data instanceof Error) {
    return {
      name: data.name,
      message: data.message,
      stack: data.stack,
    };
  }

  return data;
}

/**
 * Logger scoped to one analysis job. Each job writes to its own
 * folder, so concurrent analyses never mix their logs.
 *
 * Logging failures are reported to the console but never fail
 * the analysis itself.
 */
export class JobLogger {
  private readonly directory: string;

  private ready: Promise<void> | undefined;

  constructor(jobId: string) {
    const timestamp = new Date().toISOString().replace(/:/g, "-");

    this.directory = path.join(LOG_DIRECTORY, `${timestamp}-${jobId}`);
  }

  private async writeFile(
    file: string,
    content: string,
    append = false,
  ): Promise<void> {
    try {
      this.ready ??= fs
        .mkdir(this.directory, { recursive: true })
        .then(() => undefined);

      await this.ready;

      const target = path.join(this.directory, file);

      await (append
        ? fs.appendFile(target, content)
        : fs.writeFile(target, content));
    } catch (error) {
      console.error("Failed to write log file:", error);
    }
  }

  private async write(file: string, entry: LogEntry): Promise<void> {
    const line = [
      `[${new Date().toISOString()}]`,
      `[${entry.level}]`,
      entry.message,
      "",
      entry.data === undefined
        ? ""
        : JSON.stringify(serialize(entry.data), null, 2),
      "",
    ].join("\n");

    await this.writeFile(file, line, true);
  }

  async info(message: string, data?: unknown): Promise<void> {
    await this.write("app.log", { level: "INFO", message, data });
  }

  async warn(message: string, data?: unknown): Promise<void> {
    await this.write("app.log", { level: "WARN", message, data });
  }

  async error(message: string, data?: unknown): Promise<void> {
    await this.write("error.log", { level: "ERROR", message, data });
  }

  /**
   * The artifact writers below store the user's source code (prompt)
   * and model output. They only run when SAVE_DEBUG_ARTIFACTS=true.
   */
  async prompt(prompt: string): Promise<void> {
    if (!env.SAVE_DEBUG_ARTIFACTS) return;

    await this.writeFile("prompt.txt", prompt);
  }

  async geminiResponse(response: string): Promise<void> {
    if (!env.SAVE_DEBUG_ARTIFACTS) return;

    await this.writeFile("gemini-response.json", response);
  }

  async validatedReport(report: unknown): Promise<void> {
    if (!env.SAVE_DEBUG_ARTIFACTS) return;

    await this.writeFile(
      "validated-report.json",
      JSON.stringify(report, null, 2),
    );
  }

  async markdown(markdown: string): Promise<void> {
    if (!env.SAVE_DEBUG_ARTIFACTS) return;

    await this.writeFile("engineering-report.md", markdown);
  }
}
