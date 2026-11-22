import { extractRepositoryArchive } from "./extraction/extraction.service.js";
import { traverseRepository } from "./traversal/traversal.service.js";
import { filterRepository } from "./filtering/filtering.service.js";
import { readRepository } from "./reader/reader.service.js";
import { buildRepositoryMetadata } from "./metadata/metadata.service.js";

import type { RepositoryMetadata } from "../types/repository.js";
import type { JobContext } from "../jobs/job.types.js";

export async function processRepository(
  zipFilePath: string,
  extractionDirectory: string,
  job: JobContext,
  displayName?: string,
): Promise<RepositoryMetadata> {
  job.setStage("EXTRACTING");

  const repositoryRoot = await extractRepositoryArchive(
    zipFilePath,
    extractionDirectory,
  );

  await job.logger.info("Repository extracted");

  job.setStage("READING_REPOSITORY");

  const tree = await traverseRepository(repositoryRoot);

  const filtered = filterRepository(tree);

  const content = await readRepository(filtered);

  await job.logger.info("Repository files loaded", {
    totalFiles: tree.totalFiles,
    analyzableFiles: filtered.files.length,
  });

  job.setStage("STATIC_ANALYSIS");

  const metadata = buildRepositoryMetadata(content, tree, displayName);

  await job.logger.info("Repository metadata generated");

  return metadata;
}
