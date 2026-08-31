import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { WorkspaceFile } from "@/core/workspace/contracts";

import {
  buildWorkspaceFileTree,
  filterWorkspaceDirectories,
  filterWorkspaceFiles,
  ProjectFilesPanel,
} from "./project-files-panel";

const files: WorkspaceFile[] = [
  createFile("src/components/header.html", "language.html"),
  createFile("src/components/footer.html", "language.html"),
  createFile("src/styles/styles.css", "language.css"),
  createFile("index.html", "language.html"),
  {
    ...createFile("hidden.js", "language.javascript"),
    visible: false,
  },
];

describe("ProjectFilesPanel", () => {
  it("builds folders before files and omits unavailable files", () => {
    const tree = buildWorkspaceFileTree(files, ["assets/icons"]);

    expect(tree.name).toBe("lessonique-workspace");
    expect(tree.children.map(({ name }) => name)).toEqual([
      "assets",
      "src",
      "index.html",
    ]);
    const sourceFolder = tree.children[1];
    expect(sourceFolder?.type).toBe("folder");
    if (sourceFolder?.type !== "folder") {
      throw new Error("Expected the first item to be the source folder.");
    }
    expect(sourceFolder.children.map(({ name }) => name)).toEqual([
      "components",
      "styles",
    ]);
    expect(JSON.stringify(tree)).not.toContain("hidden.js");
    expect(JSON.stringify(tree)).toContain("assets/icons");
  });

  it("filters case-insensitively by the complete file path", () => {
    expect(
      filterWorkspaceFiles(files, "COMPONENTS/HEAD").map(({ path }) => path),
    ).toEqual(["src/components/header.html"]);
    expect(filterWorkspaceFiles(files, "missing")).toEqual([]);
    expect(filterWorkspaceDirectories(["assets/icons", "src"], "ICON")).toEqual([
      "assets/icons",
    ]);
  });

  it("renders the searchable expanded hierarchy and active file state", () => {
    const markup = renderToStaticMarkup(
      createElement(ProjectFilesPanel, {
        activeFilePath: "src/components/header.html",
        directories: ["assets/icons"],
        files,
        onCreateDirectory: vi.fn(),
        onCreateFile: vi.fn(),
        onDeleteDirectory: vi.fn(),
        onDeleteFile: vi.fn(),
        onRenameDirectory: vi.fn(),
        onRenameFile: vi.fn(),
        onSelect: vi.fn(),
      }),
    );

    expect(markup).toContain("Project Files");
    expect(markup).toContain('placeholder="Search files..."');
    expect(markup).toContain('aria-label="Workspace file tree"');
    expect(markup).toContain('data-folder-path="lessonique-workspace"');
    expect(markup).toContain('data-folder-path="src/components"');
    expect(markup).toContain('data-folder-path="assets/icons"');
    expect(markup).toContain('data-file-path="src/components/header.html"');
    expect(markup).toContain('data-project-entry-row="src/components/header.html"');
    expect(markup).toContain('aria-label="Create file"');
    expect(markup).toContain('aria-label="Create folder"');
    expect(markup).toContain('aria-selected="true"');
    expect(markup).not.toContain('id="project-file-operation-title"');
    expect(markup).not.toContain('aria-label="Rename folder assets"');
    expect(markup).not.toContain("hidden.js");
  });
});

function createFile(path: string, languageId: string): WorkspaceFile {
  return {
    path,
    languageId,
    content: "",
    visible: true,
  };
}
