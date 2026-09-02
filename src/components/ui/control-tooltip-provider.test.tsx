import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  CONTROL_TOOLTIP_OPTIONS,
  CONTROL_TOOLTIP_SELECTOR,
  ControlTooltipProvider,
} from "./control-tooltip-provider";

describe("ControlTooltipProvider", () => {
  it("keeps the delegated tooltip contract compact and non-interactive", () => {
    expect(CONTROL_TOOLTIP_SELECTOR).toBe("[data-tooltip]");
    expect(CONTROL_TOOLTIP_OPTIONS).toMatchObject({
      allowHTML: false,
      animation: "scale",
      aria: { content: "describedby", expanded: false },
      arrow: false,
      delay: [250, 60],
      duration: [220, 140],
      inertia: true,
      interactive: false,
      theme: "lessonique",
      touch: false,
      trigger: "mouseenter focus",
      zIndex: 35,
    });
  });

  it("adds no layout wrapper around application content", () => {
    const markup = renderToStaticMarkup(
      createElement(
        ControlTooltipProvider,
        null,
        createElement("button", {
          "aria-label": "Run code",
          "data-tooltip": "Run code",
        }),
      ),
    );

    expect(markup).toBe(
      '<button aria-label="Run code" data-tooltip="Run code"></button>',
    );
  });
});
