import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NavigationSidebar } from "./navigation-sidebar";

describe("NavigationSidebar", () => {
  it("renders the expanded primary navigation contract", () => {
    const markup = renderToStaticMarkup(createElement(NavigationSidebar));

    expect(markup).toContain('aria-label="Primary navigation"');
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain("Guided Class");
    expect(markup).toContain("Alex Morgan");
  });
});
