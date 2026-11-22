import fs from "node:fs/promises";

import type {
  FilteredRepository,
  RepositoryContent,
  RepositoryFile,
} from "../../types/repository.js";

/**
 * Reads the full content of every analyzable file. Files are at most
 * MAX_FILE_SIZE_BYTES (filtering), so metrics and analyzers see whole
 * files. Shortening for the prompt happens later, in the AI context.
 */
async function readRepositoryFile(
  file: FilteredRepository["files"][number],
): Promise<RepositoryFile> {
  const content = await fs.readFile(file.absolutePath, "utf8");

  return {
    ...file,
    content,
  };
}

export async function readRepository(
  repository: FilteredRepository,
): Promise<RepositoryContent> {
  const files: RepositoryFile[] = await Promise.all(
    repository.files.map(readRepositoryFile),
  );

  return {
    rootPath: repository.rootPath,
    files,
  };
}
