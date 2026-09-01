import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ConsoleSurfaceAdapter } from "@/adapters/console/console-surface-adapter";

import { WorkspaceConsole } from "./workspace-console";

describe("WorkspaceConsole", () => {
  it("fills its assigned height and expands the empty state", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkspaceConsole, {
        adapter: {} as ConsoleSurfaceAdapter,
        entries: [],
      }),
    );

    expect(markup).toContain('aria-label="Runtime console"');
    expect(markup).toContain("flex h-full min-h-0 flex-col");
    expect(markup).toContain('data-slot="console-empty-state"');
    expect(markup).toContain("min-h-full flex-1");
    expect(markup).toContain("Console output will appear here.");
  });
});
