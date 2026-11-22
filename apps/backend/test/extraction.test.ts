import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { createZip, listFiles, renameEntryInPlace, tempDir } from "./helpers/zip.js";

// Small limits so the zip-bomb and entry-count tests stay fast.
vi.mock("../src/constants/upload.js", () => ({
  MAX_UPLOAD_SIZE: 500 * 1024 * 1024,
  MAX_ANALYZABLE_SIZE: 50 * 1024 * 1024,
  MAX_EXTRACTED_SIZE: 1024 * 1024,
  MAX_EXTRACTED_ENTRIES: 20,
}));

const { extractRepositoryArchive } = await import(
  "../src/repository/extraction/extraction.service.js"
);
const { InvalidArchiveError } = await import(
  "../src/repository/errors/InvalidArchiveError.js"
);
const { RepositoryTooLargeError } = await import(
  "../src/repository/errors/RepositoryTooLargeError.js"
);

describe("extractRepositoryArchive", () => {
  it("returns the single top-level folder as the repository root", async () => {
    const zip = await createZip([
      { name: "repo/README.md", content: "# hi" },
      { name: "repo/src/index.ts", content: "export {};" },
    ]);
    const dir = await tempDir();

    const root = await extractRepositoryArchive(zip, dir);

    expect(root).toBe(path.join(dir, "repo"));
    expect(await listFiles(root)).toEqual(["README.md", "src/index.ts"]);
  });

  it("keeps the extraction folder as root when there are top-level files", async () => {
    const zip = await createZip([
      { name: "README.md", content: "# hi" },
      { name: "src/index.ts", content: "export {};" },
    ]);
    const dir = await tempDir();

    expect(await extractRepositoryArchive(zip, dir)).toBe(path.resolve(dir));
  });

  it("skips symlinks so the archive cannot point at server files", async () => {
    const zip = await createZip([
      { name: "repo/src/index.ts", content: "export {};" },
      { name: "repo/src/leak.ts", symlinkTo: "/etc/passwd" },
    ]);
    const dir = await tempDir();

    const root = await extractRepositoryArchive(zip, dir);
    const files = await listFiles(root);

    expect(files).toEqual(["src/index.ts"]);
  });

  it("never writes ignored directories such as node_modules and .git", async () => {
    const zip = await createZip([
      { name: "repo/src/index.ts", content: "export {};" },
      { name: "repo/node_modules/react/index.js", content: "x" },
      { name: "repo/.git/config", content: "x" },
      { name: "repo/packages/a/dist/out.js", content: "x" },
    ]);
    const dir = await tempDir();

    const root = await extractRepositoryArchive(zip, dir);

    expect(await listFiles(root)).toEqual(["src/index.ts"]);
  });

  it("rejects path traversal entries", async () => {
    const zip = await createZip([
      { name: "repo/a.ts", content: "x" },
      { name: "aa/evil.ts", content: "pwned" },
    ]);
    await renameEntryInPlace(zip, "aa/evil.ts", "../evil.ts");
    const dir = await tempDir();

    await expect(extractRepositoryArchive(zip, dir)).rejects.toBeInstanceOf(
      InvalidArchiveError,
    );
    await expect(
      fs.stat(path.join(dir, "..", "evil.ts")),
    ).rejects.toThrow();
  });

  it("stops zip bombs at the extracted-size limit", async () => {
    const zip = await createZip([
      { name: "repo/big.txt", content: Buffer.alloc(2 * 1024 * 1024) },
    ]);
    const dir = await tempDir();

    await expect(extractRepositoryArchive(zip, dir)).rejects.toBeInstanceOf(
      RepositoryTooLargeError,
    );
  });

  it("rejects archives with too many files", async () => {
    const zip = await createZip(
      Array.from({ length: 25 }, (_, i) => ({
        name: `repo/f${i}.ts`,
        content: "x",
      })),
    );
    const dir = await tempDir();

    await expect(extractRepositoryArchive(zip, dir)).rejects.toBeInstanceOf(
      InvalidArchiveError,
    );
  });

  it("rejects files that are not ZIP archives", async () => {
    const dir = await tempDir();
    const fake = path.join(dir, "fake.zip");
    await fs.writeFile(fake, "not a zip");

    await expect(
      extractRepositoryArchive(fake, path.join(dir, "out")),
    ).rejects.toBeInstanceOf(InvalidArchiveError);
  });
});
