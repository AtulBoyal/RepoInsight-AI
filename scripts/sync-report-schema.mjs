#!/usr/bin/env node
/**
 * Copies the backend's Zod report schema into the frontend, so both
 * apps share one definition of the report without importing across
 * app folders (each app deploys from its own root directory).
 *
 *   node scripts/sync-report-schema.mjs          write the frontend copy
 *   node scripts/sync-report-schema.mjs --check  fail if the copy is stale
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SOURCE = "apps/backend/src/ai/report/report.schema.ts";
const TARGET = "apps/frontend/src/types/report.schema.generated.ts";

const HEADER = [
  "// AUTO-GENERATED FILE. DO NOT EDIT.",
  `// Source: ${SOURCE}`,
  "// Regenerate with: npm run sync:schema (from the repository root)",
  "",
  "",
].join("\n");

const source = fs.readFileSync(path.join(root, SOURCE), "utf8");

const allowedImports = /^import\s.+\sfrom\s+["']zod["'];?$/;

for (const line of source.split("\n")) {
  if (/^\s*import\s/.test(line) && !allowedImports.test(line.trim())) {
    console.error(
      `${SOURCE} imports something other than "zod":\n  ${line.trim()}\n` +
        "The frontend copy must be self-contained. Move that dependency out of the schema file.",
    );
    process.exit(1);
  }
}

const expected = HEADER + source;
const targetPath = path.join(root, TARGET);

if (process.argv.includes("--check")) {
  const current = fs.existsSync(targetPath)
    ? fs.readFileSync(targetPath, "utf8")
    : "";

  if (current !== expected) {
    console.error(
      `${TARGET} is out of date with ${SOURCE}.\n` +
        "Run: npm run sync:schema",
    );
    process.exit(1);
  }

  console.log("Report schema is in sync.");
} else {
  fs.writeFileSync(targetPath, expected);
  console.log(`Wrote ${TARGET}`);
}
