import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Button } from "./button";

describe("Button", () => {
  it("renders accessible button content and state", () => {
    const markup = renderToStaticMarkup(
      createElement(Button, { disabled: true }, "Continue"),
    );

    expect(markup).toContain("<button");
    expect(markup).toContain("disabled");
    expect(markup).toContain("Continue");
  });
});
