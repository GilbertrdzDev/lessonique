import { describe, expect, it } from "vitest";

import { PreviewTargetQueryRegistry } from "./registries";

describe("PreviewTargetQueryRegistry", () => {
  it("stores defensive copies of closed source-derived queries", () => {
    const registry = new PreviewTargetQueryRegistry();
    const query = {
      kind: "html-element" as const,
      tagName: "button",
      className: "menu-toggle",
      occurrence: 0,
    };

    registry.register({ id: "preview-query.menu-toggle", query });
    const snapshot = registry.get("preview-query.menu-toggle");

    expect(snapshot).toEqual(query);
    if (snapshot?.kind === "html-element") {
      snapshot.className = "mutated";
    }
    expect(registry.get("preview-query.menu-toggle")).toEqual(query);
  });

  it.each([
    {
      label: "raw selector",
      query: {
        kind: "html-element",
        tagName: "button",
        occurrence: 0,
        selector: "button.menu-toggle",
      },
    },
    {
      label: "XPath",
      query: {
        kind: "registered-anchor",
        anchorId: "menu.toggle",
        xpath: "//button",
      },
    },
    {
      label: "DOM path",
      query: {
        kind: "html-element",
        tagName: "button",
        occurrence: 0,
        domPath: "body/button[1]",
      },
    },
    {
      label: "pixel coordinates",
      query: {
        kind: "html-element",
        tagName: "button",
        occurrence: 0,
        coordinates: [10, 20],
      },
    },
    {
      label: "invalid anchor syntax",
      query: {
        kind: "registered-anchor",
        anchorId: "button[data-secret]",
      },
    },
    {
      label: "invalid runtime field type",
      query: {
        kind: "html-element",
        id: 7,
        occurrence: 0,
      },
    },
  ])("rejects $label before registering a preview query", ({ query }) => {
    const registry = new PreviewTargetQueryRegistry();

    expect(() =>
      registry.register({
        id: "preview-query.unsafe",
        query: query as never,
      }),
    ).toThrow();
    expect(registry.get("preview-query.unsafe")).toBeUndefined();
  });
});
