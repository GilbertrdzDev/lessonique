import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ClassroomPage from "./page";

describe("ClassroomPage", () => {
  it("renders the classroom foundation", () => {
    const markup = renderToStaticMarkup(createElement(ClassroomPage));

    expect(markup).toContain("<h1>Lessonique classroom</h1>");
    expect(markup).toContain("The classroom foundation is ready.");
  });
});
