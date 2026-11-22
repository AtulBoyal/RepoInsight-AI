import path from "node:path";

import type { RepositoryFile } from "../../types/repository.js";

/**
 * Orders repository files by how useful they are for a review,
 * so the most informative files fit into the prompt budget first.
 *
 * Tiers (lower is better):
 *  0  root README, manifests and build/deploy config
 *  1  entry points (index/main/app/server/...) near the root
 *  2  a few test files (enough to judge testing practice)
 *  3  other source files, most-imported first
 *  4  remaining tests
 *  5  docs, styles, markup and data files
 *
 * Import counts come from a lightweight regex scan of relative
 * imports in JS/TS and Python. Other languages fall back to
 * directory depth and size.
 */

const MANIFEST_NAMES = new Set([
  "package.json",
  "tsconfig.json",
  "pyproject.toml",
  "requirements.txt",
  "setup.py",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "go.mod",
  "Cargo.toml",
  "Gemfile",
  "composer.json",
  "Dockerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
  "Makefile",
  "vite.config.ts",
  "vite.config.js",
  "next.config.js",
  "next.config.mjs",
  ".env.example",
]);

const ENTRY_STEMS = new Set([
  "index",
  "main",
  "app",
  "server",
  "cli",
  "__main__",
  "manage",
  "application",
]);

const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".java", ".kt", ".kts", ".scala", ".go", ".rs",
  ".c", ".h", ".cpp", ".cc", ".cxx", ".hpp", ".cs",
  ".rb", ".php", ".swift", ".dart", ".vue", ".svelte", ".astro",
]);

const JS_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

const MAX_EARLY_TESTS = 3;

function toPosix(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}

function stemOf(fileName: string): string {
  return fileName.slice(0, fileName.length - path.extname(fileName).length);
}

function depthOf(relativePath: string): number {
  return toPosix(relativePath).split("/").length - 1;
}

function isTestPath(relativePath: string): boolean {
  const posix = toPosix(relativePath).toLowerCase();
  const stem = stemOf(path.basename(relativePath));

  return (
    /(^|\/)(__tests__|tests?|spec)\//.test(posix) ||
    /\.(test|spec)$/i.test(stem) ||
    /^test_/i.test(stem) ||
    /_test$/i.test(stem) ||
    /(Test|Tests|Spec)$/.test(stem)
  );
}

function isWorkflowFile(relativePath: string): boolean {
  return toPosix(relativePath).startsWith(".github/workflows/");
}

/**
 * Counts how many files import each file (relative imports only).
 */
function countImports(files: RepositoryFile[]): Map<string, number> {
  const known = new Set(files.map((file) => toPosix(file.relativePath)));
  const counts = new Map<string, number>();

  const resolveJs = (fromDir: string, specifier: string): string | null => {
    const base = path.posix.normalize(path.posix.join(fromDir, specifier));

    // NodeNext-style "./x.js" imports usually point at "./x.ts".
    const withoutJs = base.replace(/\.(m|c)?js$/, "");

    const candidates = [
      base,
      ...JS_EXTENSIONS.map((ext) => withoutJs + ext),
      ...JS_EXTENSIONS.map((ext) => `${base}/index${ext}`),
    ];

    return candidates.find((candidate) => known.has(candidate)) ?? null;
  };

  const resolvePy = (fromDir: string, dots: string, module: string): string | null => {
    let dir = fromDir;

    for (let i = 1; i < dots.length; i++) {
      dir = path.posix.dirname(dir);
    }

    const base = path.posix.join(dir, module.replace(/\./g, "/"));

    return (
      [`${base}.py`, `${base}/__init__.py`].find((candidate) =>
        known.has(candidate),
      ) ?? null
    );
  };

  const jsImport =
    /(?:from\s+|import\s*\(\s*|require\s*\(\s*|^\s*import\s+)["'](\.{1,2}\/[^"']+)["']/gm;

  const pyImport = /^\s*from\s+(\.+)([\w.]*)\s+import\b/gm;

  for (const file of files) {
    const posix = toPosix(file.relativePath);
    const fromDir = path.posix.dirname(posix);
    const extension = path.extname(file.name).toLowerCase();
    const targets = new Set<string>();

    if (JS_EXTENSIONS.includes(extension) || [".vue", ".svelte", ".astro"].includes(extension)) {
      for (const match of file.content.matchAll(jsImport)) {
        const target = resolveJs(fromDir, match[1]);
        if (target) targets.add(target);
      }
    }

    if (extension === ".py") {
      for (const match of file.content.matchAll(pyImport)) {
        const target = resolvePy(fromDir, match[1], match[2]);
        if (target) targets.add(target);
      }
    }

    targets.delete(posix);

    for (const target of targets) {
      counts.set(target, (counts.get(target) ?? 0) + 1);
    }
  }

  return counts;
}

export function rankFiles(files: RepositoryFile[]): RepositoryFile[] {
  const importCounts = countImports(files);

  let earlyTests = 0;

  const tierOf = (file: RepositoryFile): number => {
    const extension = path.extname(file.name).toLowerCase();
    const depth = depthOf(file.relativePath);

    if (
      (depth <= 2 && MANIFEST_NAMES.has(file.name)) ||
      (depth === 0 && /^readme(\.|$)/i.test(file.name)) ||
      isWorkflowFile(file.relativePath)
    ) {
      return 0;
    }

    if (!CODE_EXTENSIONS.has(extension)) {
      return 5;
    }

    if (isTestPath(file.relativePath)) {
      if (earlyTests < MAX_EARLY_TESTS) {
        earlyTests++;
        return 2;
      }

      return 4;
    }

    if (depth <= 3 && ENTRY_STEMS.has(stemOf(file.name).toLowerCase())) {
      return 1;
    }

    return 3;
  };

  // Deterministic input order so "first N tests" is stable.
  const sorted = [...files].sort((a, b) =>
    a.relativePath.localeCompare(b.relativePath),
  );

  const scored = sorted.map((file) => ({
    file,
    tier: tierOf(file),
    imports: importCounts.get(toPosix(file.relativePath)) ?? 0,
    depth: depthOf(file.relativePath),
  }));

  scored.sort(
    (a, b) =>
      a.tier - b.tier ||
      b.imports - a.imports ||
      a.depth - b.depth ||
      a.file.size - b.file.size ||
      a.file.relativePath.localeCompare(b.file.relativePath),
  );

  return scored.map((entry) => entry.file);
}
