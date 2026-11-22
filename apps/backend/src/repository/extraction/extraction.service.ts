import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import yauzl from "yauzl";

import { IGNORED_DIRECTORIES } from "../../constants/repository.js";
import {
  MAX_EXTRACTED_ENTRIES,
  MAX_EXTRACTED_SIZE,
} from "../../constants/upload.js";
import { InvalidArchiveError } from "../errors/InvalidArchiveError.js";
import { RepositoryTooLargeError } from "../errors/RepositoryTooLargeError.js";

const S_IFMT = 0o170000;
const S_IFLNK = 0o120000;

function openZip(zipFilePath: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(
      zipFilePath,
      { lazyEntries: true, autoClose: true },
      (error, zipFile) => {
        if (error || !zipFile) {
          reject(
            new InvalidArchiveError(
              "The uploaded file is not a valid ZIP archive.",
            ),
          );
          return;
        }

        resolve(zipFile);
      },
    );
  });
}

function openEntryStream(
  zipFile: yauzl.ZipFile,
  entry: yauzl.Entry,
): Promise<NodeJS.ReadableStream> {
  return new Promise((resolve, reject) => {
    zipFile.openReadStream(entry, (error, stream) => {
      if (error || !stream) {
        reject(error ?? new Error("Unable to read ZIP entry."));
        return;
      }

      resolve(stream);
    });
  });
}

function isSymlink(entry: yauzl.Entry): boolean {
  const mode = (entry.externalFileAttributes >>> 16) & 0xffff;

  return (mode & S_IFMT) === S_IFLNK;
}

function isInIgnoredDirectory(fileName: string): boolean {
  return fileName
    .split("/")
    .slice(0, -1)
    .some((segment) => IGNORED_DIRECTORIES.has(segment));
}

/**
 * Extracts a repository ZIP safely:
 *
 * - symlinks are skipped, so the archive cannot point at server files
 * - entries under ignored directories (node_modules, .git, ...) are skipped
 * - extracted size and entry count are capped (zip-bomb protection)
 * - paths are validated by yauzl (no absolute paths, no "..")
 *
 * Returns the repository root (the single top-level folder, if there is one).
 */
export async function extractRepositoryArchive(
  zipFilePath: string,
  extractionDirectory: string,
): Promise<string> {
  const destination = path.resolve(extractionDirectory);

  await fsPromises.mkdir(destination, { recursive: true });

  const zipFile = await openZip(zipFilePath);

  let extractedBytes = 0;
  let extractedEntries = 0;

  await new Promise<void>((resolve, reject) => {
    const fail = (error: unknown) => {
      zipFile.close();

      if (
        error instanceof InvalidArchiveError ||
        error instanceof RepositoryTooLargeError
      ) {
        reject(error);
        return;
      }

      reject(
        new InvalidArchiveError(
          `The ZIP archive could not be extracted: ${
            error instanceof Error ? error.message : "unknown error"
          }`,
        ),
      );
    };

    zipFile.on("error", fail);
    zipFile.on("end", () => resolve());

    zipFile.on("entry", (entry: yauzl.Entry) => {
      (async () => {
        const fileName = entry.fileName;
        const isDirectory = fileName.endsWith("/");

        if (
          isDirectory ||
          isSymlink(entry) ||
          isInIgnoredDirectory(fileName)
        ) {
          zipFile.readEntry();
          return;
        }

        extractedEntries++;
        extractedBytes += entry.uncompressedSize;

        if (extractedEntries > MAX_EXTRACTED_ENTRIES) {
          throw new InvalidArchiveError(
            `The ZIP archive contains more than ${MAX_EXTRACTED_ENTRIES} files outside ignored directories.`,
          );
        }

        if (extractedBytes > MAX_EXTRACTED_SIZE) {
          throw new RepositoryTooLargeError(
            extractedBytes,
            MAX_EXTRACTED_SIZE,
          );
        }

        const target = path.resolve(destination, fileName);

        if (!target.startsWith(destination + path.sep)) {
          throw new InvalidArchiveError(
            `Unsafe path in ZIP archive: ${fileName}`,
          );
        }

        await fsPromises.mkdir(path.dirname(target), {
          recursive: true,
        });

        // yauzl verifies the declared uncompressed size while
        // streaming, so a lying header cannot exceed the cap.
        const stream = await openEntryStream(zipFile, entry);

        await pipeline(stream, fs.createWriteStream(target));

        zipFile.readEntry();
      })().catch(fail);
    });

    zipFile.readEntry();
  });

  const entries = await fsPromises.readdir(destination, {
    withFileTypes: true,
  });

  const directories = entries.filter((entry) => entry.isDirectory());

  if (directories.length === 1 && entries.length === 1) {
    return path.join(destination, directories[0].name);
  }

  return destination;
}
