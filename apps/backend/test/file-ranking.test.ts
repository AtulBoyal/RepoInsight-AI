import { describe, expect, it } from "vitest";

import { rankFiles } from "../src/ai/context/file-ranking.js";
import type { RepositoryFile } from "../src/types/repository.js";

function file(relativePath: string, content = ""): RepositoryFile {
  return {
    id: relativePath,
    name: relativePath.split("/").pop()!,
    relativePath,
    absolutePath: `/repo/${relativePath}`,
    type: "file",
    size: content.length,
    content,
  };
}

describe("rankFiles", () => {
  it("orders manifests, entry points, early tests, then most-imported source", () => {
    const ranked = rankFiles([
      file("docs/guide.md"),
      file("src/feature-a.ts", "import { util } from './lib/util.js';"),
      file("src/feature-b.ts", "import { util } from './lib/util';"),
      file("src/lib/util.ts"),
      file("src/lonely.ts"),
      file("src/server.ts", "import './feature-a.js';"),
      file("src/feature-a.test.ts"),
      file("package.json", "{}"),
      file("README.md", "# hi"),
    ]).map((f) => f.relativePath);

    expect(ranked).toEqual([
      "README.md",
      "package.json",
      "src/server.ts",
      "src/feature-a.test.ts",
      "src/lib/util.ts", // imported twice
      "src/feature-a.ts", // imported once
      "src/lonely.ts", // not imported: smaller file first
      "src/feature-b.ts",
      "docs/guide.md",
    ]);
  });

  it("resolves relative Python imports", () => {
    const ranked = rankFiles([
      file("pkg/a.py"),
      file("pkg/models.py"),
      file("pkg/views.py", "from .models import User\n"),
      file("pkg/api.py", "from .models import User\n"),
    ]).map((f) => f.relativePath);

    expect(ranked[0]).toBe("pkg/models.py");
  });
});
