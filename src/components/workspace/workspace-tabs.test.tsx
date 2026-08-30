import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceTabs } from "./workspace-tabs";

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
        onSelect: vi.fn(),
      }),
    );

    expect(markup).toContain('role="tablist"');
    expect(markup).toContain("index.html");
    expect(markup).toContain("styles.css");
    expect(markup).not.toContain("hidden.js");
    expect(markup).toContain('aria-selected="true"');
  });
});
