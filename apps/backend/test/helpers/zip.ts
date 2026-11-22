import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import yazl from "yazl";

export interface ZipEntry {
  name: string;
  content?: string | Buffer;
  /** Create a symlink pointing at this target instead of a file. */
  symlinkTo?: string;
}

/**
 * Builds a ZIP in a temp directory and returns its path.
 */
export async function createZip(entries: ZipEntry[]): Promise<string> {
  const zip = new yazl.ZipFile();

  for (const entry of entries) {
    if (entry.symlinkTo !== undefined) {
      zip.addBuffer(Buffer.from(entry.symlinkTo), entry.name, {
        mode: 0o120777,
      });
    } else {
      zip.addBuffer(Buffer.from(entry.content ?? ""), entry.name);
    }
  }

  zip.end();

  const chunks: Buffer[] = [];

  for await (const chunk of zip.outputStream) {
    chunks.push(chunk as Buffer);
  }

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zip-test-"));
  const file = path.join(dir, "repo.zip");

  await fs.writeFile(file, Buffer.concat(chunks));

  return file;
}

/**
 * Rewrites an entry name inside a ZIP's raw bytes (local header and
 * central directory). Used to create names yazl refuses to write,
 * such as "../evil.ts". Both names must have the same length.
 */
export async function renameEntryInPlace(
  zipPath: string,
  from: string,
  to: string,
): Promise<void> {
  if (from.length !== to.length) {
    throw new Error("Names must have the same length.");
  }

  const bytes = await fs.readFile(zipPath);
  const search = Buffer.from(from);
  const replacement = Buffer.from(to);

  let index = bytes.indexOf(search);

  while (index !== -1) {
    replacement.copy(bytes, index);
    index = bytes.indexOf(search, index + search.length);
  }

  await fs.writeFile(zipPath, bytes);
}

export async function tempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "extract-test-"));
}

export async function listFiles(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, {
    recursive: true,
    withFileTypes: true,
  });

  return entries
    .filter((entry) => entry.isFile() || entry.isSymbolicLink())
    .map((entry) =>
      path
        .relative(root, path.join(entry.parentPath, entry.name))
        .split(path.sep)
        .join("/"),
    )
    .sort();
}
