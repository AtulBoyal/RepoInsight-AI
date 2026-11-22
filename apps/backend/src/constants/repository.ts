/**
 * Directories that never contain hand-written source code.
 * They are skipped during extraction, so they never touch disk.
 */
export const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  ".hg",
  ".svn",

  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  ".output",
  ".svelte-kit",
  ".vercel",

  "coverage",

  "vendor",
  "target",
  "bin",
  "obj",
  ".gradle",

  "__pycache__",
  ".venv",
  "venv",
  ".mypy_cache",
  ".pytest_cache",
  ".tox",

  ".cache",
  ".turbo",
  ".parcel-cache",

  ".idea",
  ".vscode",

  "__MACOSX",
]);

/**
 * Only files with these extensions (or names, below) are analyzed.
 * Anything else — images, fonts, binaries, archives — is ignored.
 */
export const TEXT_FILE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",

  ".java",
  ".kt",
  ".kts",
  ".scala",
  ".go",
  ".rs",
  ".c",
  ".h",
  ".cpp",
  ".cc",
  ".cxx",
  ".hpp",
  ".cs",

  ".py",
  ".rb",
  ".php",

  ".swift",
  ".dart",

  ".vue",
  ".svelte",
  ".astro",

  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".xml",
  ".ini",
  ".conf",
  ".properties",
  ".gradle",

  ".graphql",
  ".proto",
  ".prisma",
  ".sql",

  ".css",
  ".scss",
  ".sass",
  ".html",

  ".md",
  ".txt",

  ".sh",
]);

/**
 * Extensionless files worth analyzing.
 */
export const TEXT_FILE_NAMES = new Set([
  "Dockerfile",
  "Makefile",
  "Procfile",
  "Jenkinsfile",
  "Gemfile",
  ".gitignore",
  ".dockerignore",
  ".editorconfig",
]);

/**
 * Lockfiles and other machine-generated files. They are large,
 * carry no design signal, and pollute framework detection.
 */
export const GENERATED_FILE_NAMES = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  "composer.lock",
  "Cargo.lock",
  "poetry.lock",
  "Pipfile.lock",
  "Gemfile.lock",
  "go.sum",
]);

export const GENERATED_FILE_SUFFIXES = [
  ".min.js",
  ".min.css",
  ".map",
  ".lock",
];

/**
 * Files that commonly hold credentials. They are never read,
 * so their contents are never sent to the LLM or written to logs.
 */
const SENSITIVE_FILE_NAMES = new Set([
  ".npmrc",
  ".pypirc",
  ".netrc",
  "id_rsa",
  "id_ed25519",
  "credentials.json",
  "service-account.json",
]);

const SENSITIVE_EXTENSIONS = new Set([
  ".pem",
  ".key",
  ".p12",
  ".pfx",
  ".keystore",
  ".jks",
]);

const ENV_TEMPLATE_SUFFIXES = [
  ".example",
  ".sample",
  ".template",
  ".dist",
];

export function isSensitiveFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();

  if (lower === ".env" || lower.startsWith(".env.")) {
    return !ENV_TEMPLATE_SUFFIXES.some((suffix) =>
      lower.endsWith(suffix),
    );
  }

  if (SENSITIVE_FILE_NAMES.has(lower)) {
    return true;
  }

  const dot = lower.lastIndexOf(".");

  return dot > 0 && SENSITIVE_EXTENSIONS.has(lower.slice(dot));
}

export const MAX_FILE_SIZE_BYTES = 512 * 1024; // 512 KB

export const MAX_FILE_CONTENT_CHARS = 10000;
