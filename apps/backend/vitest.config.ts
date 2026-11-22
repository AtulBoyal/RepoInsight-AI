import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineConfig } from "vitest/config";

// Temp ZIPs, extraction folders and job logs created by tests go here,
// not next to real analysis logs.
const testTmpDir = path.join(os.tmpdir(), "repoinsight-tests");

fs.rmSync(testTmpDir, { recursive: true, force: true });
fs.mkdirSync(testTmpDir, { recursive: true });

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    env: {
      // env.ts requires a key at import time; tests never call Gemini.
      GEMINI_API_KEY: "test-key",
      SAVE_DEBUG_ARTIFACTS: "false",
      // Never use a real database from .env in tests (PGlite is used instead).
      DATABASE_URL: "",
      GITHUB_TOKEN: "",
      TMPDIR: testTmpDir,
    },
  },
});
