import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WorkspaceRuntimeProvider } from "@/components/workspace/workspace-runtime-provider";
import { WebMCPRegistrationProvider } from "@/components/webmcp/webmcp-registration-provider";

import { AgentSidebar } from "./agent-sidebar";

describe("AgentSidebar", () => {
  it("renders the expanded learning-agent contract", () => {
    const markup = renderToStaticMarkup(
      createElement(
        WorkspaceRuntimeProvider,
        null,
        createElement(
          WebMCPRegistrationProvider,
          null,
          createElement(AgentSidebar),
        ),
      ),
    );

    expect(markup).toContain('aria-label="Learning agent"');
    expect(markup).toContain('aria-label="Resize learning agent panel"');
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain("Learning Plan");
    expect(markup).toContain("Live Activity");
    expect(markup).toContain("WebMCP Ready");
    expect(markup).toContain("WebMCP Dev Panel");
    expect(markup).toContain("12 tools");
    expect(markup).toContain('data-interaction-anchor="anchor.learning-plan"');
    expect(markup).toContain('data-interaction-anchor="anchor.live-activity"');
  });
});
