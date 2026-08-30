import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AgentSidebar } from "./agent-sidebar";

describe("AgentSidebar", () => {
  it("renders the expanded learning-agent contract", () => {
    const markup = renderToStaticMarkup(createElement(AgentSidebar));

    expect(markup).toContain('aria-label="Learning agent"');
    expect(markup).toContain('aria-label="Resize learning agent panel"');
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain("Learning Plan");
    expect(markup).toContain("Live Activity");
    expect(markup).toContain("WebMCP Ready");
  });
});
