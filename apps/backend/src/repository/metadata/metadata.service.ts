import path from "node:path";
import { buildRepositoryMetrics } from "../metrics/metrics.service.js";
import { buildStaticAnalysis } from "../static-analysis/analysis.service.js";
import { buildRepositoryEvidence } from "../evidence/evidence.service.js";
import { extractSourceFacts } from "../static-analysis/source-facts.js";

import type {
  RepositoryContent,
  RepositoryFile,
  RepositoryMetadata,
  RepositoryTree,
} from "../../types/repository.js";


function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function detectLanguages(
  files: RepositoryFile[],
): string[] {
  const languages = new Set<string>();

  for (const file of files) {
    switch (path.extname(file.name).toLowerCase()) {
      case ".ts":
      case ".tsx":
        languages.add("TypeScript");
        break;

      case ".js":
      case ".jsx":
        languages.add("JavaScript");
        break;

      case ".java":
        languages.add("Java");
        break;

      case ".py":
        languages.add("Python");
        break;

      case ".cpp":
      case ".cc":
      case ".cxx":
        languages.add("C++");
        break;

      case ".c":
        languages.add("C");
        break;

      case ".go":
        languages.add("Go");
        break;

      case ".rs":
        languages.add("Rust");
        break;

      case ".cs":
        languages.add("C#");
        break;

      case ".php":
        languages.add("PHP");
        break;
    }
  }

  return [...languages].sort();
}

/**
 * npm packages that identify a framework. Matched against the
 * dependency names in package.json, not its raw text.
 */
const NPM_FRAMEWORKS: ReadonlyArray<[string, string]> = [
  ["react", "React"],
  ["next", "Next.js"],
  ["express", "Express"],
  ["fastify", "Fastify"],
  ["vite", "Vite"],
  ["@nestjs/core", "NestJS"],
  ["vue", "Vue"],
  ["nuxt", "Nuxt"],
  ["svelte", "Svelte"],
  ["@angular/core", "Angular"],
];

function readPackageDependencies(content: string): Set<string> {
  try {
    const manifest = JSON.parse(content) as Record<string, unknown>;
    const names = new Set<string>();

    for (const key of [
      "dependencies",
      "devDependencies",
      "peerDependencies",
    ]) {
      const section = manifest[key];

      if (section && typeof section === "object") {
        for (const name of Object.keys(section)) {
          names.add(name);
        }
      }
    }

    return names;
  } catch {
    // Truncated or malformed package.json
    return new Set();
  }
}

function detectFrameworks(
  files: RepositoryFile[],
): string[] {
  const frameworks = new Set<string>();

  for (const file of files) {
    if (file.name === "package.json") {
      const dependencies = readPackageDependencies(file.content);

      for (const [packageName, framework] of NPM_FRAMEWORKS) {
        if (dependencies.has(packageName)) {
          frameworks.add(framework);
        }
      }
    }

    if (file.name === "pom.xml") {
      frameworks.add("Maven");
    }

    if (file.name === "build.gradle" || file.name === "build.gradle.kts") {
      frameworks.add("Gradle");
    }

    if (file.name === "requirements.txt" || file.name === "pyproject.toml") {
      const content = file.content.toLowerCase();

      if (/^django\b/m.test(content) || content.includes('"django')) frameworks.add("Django");
      if (/^flask\b/m.test(content) || content.includes('"flask')) frameworks.add("Flask");
      if (/^fastapi\b/m.test(content) || content.includes('"fastapi')) frameworks.add("FastAPI");
    }

    if (file.name === "Cargo.toml") {
      frameworks.add("Cargo");
    }

    if (file.name === "go.mod") {
      frameworks.add("Go Modules");
    }
  }

  return [...frameworks].sort();
}

export function buildRepositoryMetadata(
  repository: RepositoryContent,
  tree: RepositoryTree,
): RepositoryMetadata {
  const files = repository.files;

  const configurationFiles = files
    .map((file) => file.name)
    .filter((name) =>
      [
        "package.json",
        "tsconfig.json",
        "vite.config.ts",
        "vite.config.js",
        "next.config.js",
        "next.config.mjs",
        "Dockerfile",
        "docker-compose.yml",
        "requirements.txt",
        "pyproject.toml",
        "pom.xml",
        "build.gradle",
        "Cargo.toml",
        "go.mod",
      ].includes(name),
    )
    .sort();

  const repositoryName =
    path.basename(repository.rootPath);

  const metrics = buildRepositoryMetrics(
    repository,
    tree,
  );


  // One parse of every JS/TS file feeds both the counts and the locations.
  const sourceFacts = extractSourceFacts(repository.files);

  const staticAnalysis = buildStaticAnalysis(repository.files, sourceFacts);

  const evidence = buildRepositoryEvidence(repository.files, sourceFacts);

  return {
    repositoryName,

    totalFiles: repository.files.length,

    totalDirectories: unique(
      repository.files.map((file) =>
        path.dirname(file.relativePath),
      ),
    ).length,

    languages: detectLanguages(files),

    frameworks: detectFrameworks(files),

    configurationFiles,

    hasReadme: files.some(
      (file) =>
        file.name.toLowerCase() === "readme.md",
    ),

    hasDockerfile: files.some(
      (file) => file.name === "Dockerfile",
    ),

    hasPackageJson: files.some(
      (file) => file.name === "package.json",
    ),

    largestFiles: [...files]
      .sort((a, b) => b.size - a.size)
      .slice(0, 10),

    metrics,

    staticAnalysis,

    evidence, 

    repository,
  };
}