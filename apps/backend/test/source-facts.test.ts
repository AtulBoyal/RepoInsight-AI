import { describe, expect, it } from "vitest";

import { extractSourceFacts } from "../src/repository/static-analysis/source-facts.js";
import type { RepositoryFile } from "../src/types/repository.js";

function file(relativePath: string, content: string): RepositoryFile {
  return {
    id: relativePath,
    name: relativePath.split("/").pop()!,
    relativePath,
    absolutePath: `/repo/${relativePath}`,
    type: "file",
    size: content.length,
    content,
  };
}

describe("extractSourceFacts", () => {
  it("counts real `any` types and unsafe assertions only", () => {
    const facts = extractSourceFacts([
      file(
        "src/a.ts",
        [
          "import * as fs from 'fs';",
          "import { a as b } from './x';",
          "// any comment about any thing",
          "const s = 'works with any input';",
          "const c = [1, 2] as const;",
          "let x: any = 1;",
          "const y = value as Foo;",
          "const z = <Bar>other;",
          "// @ts-ignore",
          "/* eslint-disable no-console */",
        ].join("\n"),
      ),
    ]);

    expect(facts.typescript).toEqual([
      { file: "src/a.ts", line: 6, type: "any" },
      { file: "src/a.ts", line: 7, type: "type-assertion" },
      { file: "src/a.ts", line: 8, type: "type-assertion" },
      { file: "src/a.ts", line: 9, type: "ts-ignore" },
      { file: "src/a.ts", line: 10, type: "eslint-disable" },
    ]);
  });

  it("measures functions with their real names and lengths", () => {
    const facts = extractSourceFacts([
      file(
        "src/b.ts",
        [
          "export function first() {", // 1
          "  const text = '{ not a brace }';", // 2
          "  return text;", // 3
          "}", // 4
          "const second = async () => {", // 5
          "  return 1;", // 6
          "};", // 7
          "class C {", // 8
          "  method() {", // 9
          "    [1].map((x) => x * 2);", // 10 (expression arrow: not counted)
          "  }", // 11
          "}", // 12
        ].join("\n"),
      ),
    ]);

    expect(facts.functions).toEqual([
      { file: "src/b.ts", line: 1, name: "first", length: 4 },
      { file: "src/b.ts", line: 5, name: "second", length: 3 },
      { file: "src/b.ts", line: 9, name: "method", length: 3 },
    ]);
  });

  it("finds console calls, debugger and process.exit, not mentions in strings", () => {
    const facts = extractSourceFacts([
      file(
        "src/c.js",
        [
          "console.log('a');",
          "const msg = 'console.log(\"not a call\")';",
          "console.error(err);",
          "debugger;",
          "process.exit(1);",
        ].join("\n"),
      ),
    ]);

    expect(facts.logging.map((fact) => [fact.line, fact.type])).toEqual([
      [1, "console.log"],
      [3, "console.error"],
      [4, "debugger"],
      [5, "process.exit"],
    ]);
  });

  it("ignores non-JS/TS files", () => {
    const facts = extractSourceFacts([file("main.py", "def f():\n  pass\n")]);

    expect(facts.parsedFiles).toBe(0);
  });
});
