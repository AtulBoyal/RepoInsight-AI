import { describe, expect, it } from "vitest";

import { filterRepository } from "../src/repository/filtering/filtering.service.js";
import { InvalidArchiveError } from "../src/repository/errors/InvalidArchiveError.js";
import type { RepositoryEntry, RepositoryTree } from "../src/types/repository.js";

function tree(paths: Array<string | [string, number]>): RepositoryTree {
  const files: RepositoryEntry[] = paths.map((entry) => {
    const [relativePath, size] =
      typeof entry === "string" ? [entry, 100] : entry;

    return {
      id: relativePath,
      name: relativePath.split("/").pop()!,
      relativePath,
      absolutePath: `/repo/${relativePath}`,
      type: "file",
      size,
    };
  });

  return {
    rootPath: "/repo",
    files,
    directories: [],
    totalFiles: files.length,
    totalDirectories: 0,
  };
}

function kept(paths: Array<string | [string, number]>): string[] {
  return filterRepository(tree(paths)).files.map((file) => file.relativePath);
}

function reasons(paths: string[]): Record<string, string> {
  return Object.fromEntries(
    filterRepository(tree([...paths, "src/keep.ts"])).ignoredFiles.map(
      (file) => [file.relativePath, file.reason],
    ),
  );
}

describe("filterRepository", () => {
  it("never reads secret files", () => {
    expect(
      reasons([".env", ".env.local", "config/.env.production", "keys/server.pem", ".npmrc"]),
    ).toEqual({
      ".env": "sensitive",
      ".env.local": "sensitive",
      "config/.env.production": "sensitive",
      "keys/server.pem": "sensitive",
      ".npmrc": "sensitive",
    });
  });

  it("keeps env templates, which document configuration", () => {
    expect(kept([".env.example", ".env.sample"])).toEqual([
      ".env.example",
      ".env.sample",
    ]);
  });

  it("skips lockfiles and minified files", () => {
    expect(
      reasons(["package-lock.json", "yarn.lock", "go.sum", "public/app.min.js"]),
    ).toEqual({
      "package-lock.json": "generated",
      "yarn.lock": "generated",
      "go.sum": "generated",
      "public/app.min.js": "generated",
    });
  });

  it("only analyzes known text files", () => {
    expect(kept(["src/a.ts", "Dockerfile", "logo.svg", "font.woff2", "data.bin"])).toEqual([
      "src/a.ts",
      "Dockerfile",
    ]);
  });

  it("skips files over the per-file size limit", () => {
    expect(kept([["src/huge.ts", 10 * 1024 * 1024], "src/ok.ts"])).toEqual([
      "src/ok.ts",
    ]);
  });

  it("fails clearly when nothing is left to analyze", () => {
    expect(() => filterRepository(tree(["logo.png", ".env"]))).toThrow(
      InvalidArchiveError,
    );
    expect(() => filterRepository(tree([]))).toThrow(/empty/);
  });
});
