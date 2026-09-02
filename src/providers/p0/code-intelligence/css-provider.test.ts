import { describe, expect, it } from "vitest";

import type { SourceDocument } from "@/core/code-intelligence";

import { CssIntelligenceProvider } from "./css-provider";
import { P0_SOURCE_LOCATOR_IDS } from "./ids";

const SOURCE = `.card, main > .card {
  color: rebeccapurple;
  display: grid;
}

#lesson {
  color: navy;
}

@media (max-width: 640px) {
  .card { display: block; }
}`;

describe("CssIntelligenceProvider", () => {
  it("resolves structured rule and declaration queries without raw selectors", () => {
    const provider = new CssIntelligenceProvider();
    const parsed = provider.parse(createDocument(SOURCE), new AbortController().signal);
    const ruleLocator = provider.locators.find(
      ({ id }) => id === P0_SOURCE_LOCATOR_IDS.cssRule,
    )!;
    const propertyLocator = provider.locators.find(
      ({ id }) => id === P0_SOURCE_LOCATOR_IDS.cssProperty,
    )!;

    const rule = ruleLocator.locate(
      parsed,
      { selectorKind: "id", selectorName: "lesson" },
      new AbortController().signal,
    ).anchors[0]!;
    const properties = propertyLocator.locate(
      parsed,
      {
        selectorKind: "class",
        selectorName: "card",
        propertyName: "display",
      },
      new AbortController().signal,
    ).anchors;

    expect(SOURCE.slice(rule.range.startOffset, rule.range.endOffset)).toContain(
      "color: navy",
    );
    expect(properties).toHaveLength(2);
    expect(() =>
      ruleLocator.locate(
        parsed,
        { selector: ".card", selectorKind: "class", selectorName: "card" },
        new AbortController().signal,
      ),
    ).toThrow('CSS locator input "selector" is not supported.');
  });

  it("resolves media queries through feature/value intent", () => {
    const provider = new CssIntelligenceProvider();
    const parsed = provider.parse(createDocument(SOURCE), new AbortController().signal);
    const locator = provider.locators.find(
      ({ id }) => id === P0_SOURCE_LOCATOR_IDS.cssMediaQuery,
    )!;
    const anchor = locator.locate(
      parsed,
      { feature: "max-width", value: "640px" },
      new AbortController().signal,
    ).anchors[0]!;

    expect(anchor.queryIntent).toBe("css.media-query");
    expect(SOURCE.slice(anchor.range.startOffset, anchor.range.endOffset)).toContain(
      "@media (max-width: 640px)",
    );
  });

  it("normalizes syntax errors and supports cancellation", () => {
    const provider = new CssIntelligenceProvider();
    const invalid = provider.parse(
      createDocument(".card { color: red;"),
      new AbortController().signal,
    );
    const controller = new AbortController();
    controller.abort();

    expect(invalid.valid).toBe(false);
    expect(invalid.diagnostics[0]).toEqual(
      expect.objectContaining({ sourceId: "parser.postcss", severity: "error" }),
    );
    expect(() => provider.parse(createDocument(SOURCE), controller.signal)).toThrowError(
      expect.objectContaining({ name: "AbortError" }),
    );
  });
});

function createDocument(content: string): SourceDocument {
  return {
    path: "styles.css",
    languageId: "language.css",
    content,
    revision: 1,
  };
}
