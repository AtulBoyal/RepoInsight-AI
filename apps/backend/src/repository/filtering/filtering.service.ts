import path from "node:path";

import {
  GENERATED_FILE_NAMES,
  GENERATED_FILE_SUFFIXES,
  IGNORED_DIRECTORIES,
  MAX_FILE_SIZE_BYTES,
  TEXT_FILE_EXTENSIONS,
  TEXT_FILE_NAMES,
  isSensitiveFile,
} from "../../constants/repository.js";

import type {
  FilteredRepository,
  IgnoredRepositoryFile,
  RepositoryEntry,
  RepositoryTree,
} from "../../types/repository.js";

import { InvalidArchiveError } from "../errors/InvalidArchiveError.js";
import { RepositoryTooLargeError } from "../errors/RepositoryTooLargeError.js";
import { MAX_ANALYZABLE_SIZE } from "../../constants/upload.js";

function getIgnoreReason(
  file: RepositoryEntry,
): IgnoredRepositoryFile["reason"] | null {
  const segments = file.relativePath.split(path.sep);

  if (segments.some((segment) => IGNORED_DIRECTORIES.has(segment))) {
    return "directory";
  }

  if (isSensitiveFile(file.name)) {
    return "sensitive";
  }

  const lowerName = file.name.toLowerCase();

  if (
    GENERATED_FILE_NAMES.has(file.name) ||
    GENERATED_FILE_SUFFIXES.some((suffix) => lowerName.endsWith(suffix))
  ) {
    return "generated";
  }

  const extension = path.extname(lowerName);

  // Non-secret env templates (.env.example, ...) document configuration.
  const isEnvTemplate = lowerName.startsWith(".env.");

  if (
    !TEXT_FILE_EXTENSIONS.has(extension) &&
    !TEXT_FILE_NAMES.has(file.name) &&
    !isEnvTemplate
  ) {
    return "extension";
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return "size";
  }

  return null;
}

export function filterRepository(
  repository: RepositoryTree,
): FilteredRepository {
  const files: RepositoryEntry[] = [];
  const ignoredFiles: IgnoredRepositoryFile[] = [];

  let analyzableSize = 0;

  for (const file of repository.files) {
    const reason = getIgnoreReason(file);

    if (reason) {
      ignoredFiles.push({
        ...file,
        reason,
      });

      continue;
    }

    files.push(file);

    analyzableSize += file.size;
  }

  if (files.length === 0) {
    throw new InvalidArchiveError(
      repository.totalFiles === 0
        ? "The ZIP archive is empty."
        : `No source files found to analyze (${repository.totalFiles} files were all skipped as dependencies, build output, binaries or secrets).`,
    );
  }

  if (analyzableSize > MAX_ANALYZABLE_SIZE) {
    throw new RepositoryTooLargeError(
      analyzableSize,
      MAX_ANALYZABLE_SIZE,
    );
  }

  return {
    rootPath: repository.rootPath,
    files,
    ignoredFiles,
  };
}
