import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ClassroomPage from "./page";

describe("ClassroomPage", () => {
  it("renders the three-column classroom shell", () => {
    const markup = renderToStaticMarkup(createElement(ClassroomPage));

    expect(markup).toContain('data-slot="app-shell"');
    expect(markup).toContain('aria-label="Primary navigation"');
    expect(markup).toContain('aria-labelledby="classroom-title"');
    expect(markup).toContain('aria-label="Learning agent"');
    expect(markup).toContain("Request received from ChatGPT");
    expect(markup).toContain("Connected through WebMCP");
    expect(markup).toContain("Learning Plan");
    expect(markup).toContain("Lessonique Classroom");
  });
});
