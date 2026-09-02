import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WebMCPRegistrationProvider } from "@/components/webmcp/webmcp-registration-provider";
import { WorkspaceRuntimeProvider } from "@/components/workspace/workspace-runtime-provider";

import HomePage from "./page";

describe("HomePage", () => {
  it("renders the root lobby without mounting a fictional classroom", () => {
    const markup = renderToStaticMarkup(
      createElement(
        WorkspaceRuntimeProvider,
        null,
        createElement(
          WebMCPRegistrationProvider,
          null,
          createElement(HomePage),
        ),
      ),
    );

    expect(markup).toContain('data-slot="lessonique-experience"');
    expect(markup).toContain('data-experience-state="supported-disconnected"');
    expect(markup).toContain("Waiting for your");
    expect(markup).not.toContain('data-slot="workspace-body"');
    expect(markup).not.toContain('aria-label="Learning agent"');
    expect(markup).not.toContain("Project Files");
    expect(markup).not.toContain("Hello world");
  });
});
