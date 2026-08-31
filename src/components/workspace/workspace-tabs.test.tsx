import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  reorderWorkspaceTabPaths,
  WORKSPACE_EDITOR_PANEL_ID,
  WorkspaceTabs,
} from "./workspace-tabs";

describe("WorkspaceTabs", () => {
  it("renders visible custom tabs and marks the active file", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkspaceTabs, {
        activeFilePath: "styles.css",
        files: [
          {
            path: "index.html",
            languageId: "language.html",
            content: "",
            visible: true,
          },
          {
            path: "styles.css",
            languageId: "language.css",
            content: "",
            visible: true,
          },
          {
            path: "hidden.js",
            languageId: "language.javascript",
            content: "",
            visible: false,
          },
        ],
        onClose: vi.fn(),
        onReorder: vi.fn(),
        onSelect: vi.fn(),
      }),
    );

    expect(markup).toContain('aria-label="Open workspace files"');
    expect(markup).toContain("index.html");
    expect(markup).toContain("styles.css");
    expect(markup).not.toContain("hidden.js");
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain(`aria-controls="${WORKSPACE_EDITOR_PANEL_ID}"`);
    expect(markup).toContain('data-workspace-tab-path="index.html"');
    expect(markup).toContain('aria-label="Close file tab styles.css"');
    expect(markup).toContain('draggable="true"');
  });

  it("reorders tabs before or after a target without mutating the source order", () => {
    const paths = ["index.html", "styles.css", "script.js"];

    expect(
      reorderWorkspaceTabPaths(paths, "index.html", "script.js", "after"),
    ).toEqual(["styles.css", "script.js", "index.html"]);
    expect(
      reorderWorkspaceTabPaths(paths, "script.js", "index.html", "before"),
    ).toEqual(["script.js", "index.html", "styles.css"]);
    expect(paths).toEqual(["index.html", "styles.css", "script.js"]);
  });

  it("leaves the order unchanged for missing or identical tab paths", () => {
    const paths = ["index.html", "styles.css"];

    expect(
      reorderWorkspaceTabPaths(paths, "missing.js", "styles.css", "before"),
    ).toEqual(paths);
    expect(
      reorderWorkspaceTabPaths(paths, "index.html", "index.html", "after"),
    ).toEqual(paths);
  });
});
