import { describe, expect, it } from "vitest";

import type { SourceDocument } from "@/core/code-intelligence";

import { HtmlIntelligenceProvider } from "./html-provider";
import { P0_SOURCE_LOCATOR_IDS } from "./ids";

const SOURCE = `<!doctype html>
<html>
  <body>
    <main id="lesson" class="card featured">
      <button class="action">Start</button>
      <button class="action secondary">Continue</button>
    </main>
  </body>
</html>`;

describe("HtmlIntelligenceProvider", () => {
  it("parses HTML with source locations and resolves semantic element anchors", () => {
    const provider = new HtmlIntelligenceProvider();
    const parsed = provider.parse(createDocument(SOURCE), new AbortController().signal);
    const locator = provider.locators.find(
      ({ id }) => id === P0_SOURCE_LOCATOR_IDS.htmlElement,
    )!;
    const result = locator.locate(
      parsed,
      { tagName: "button", occurrence: 1 },
      new AbortController().signal,
    );

    expect(parsed.valid).toBe(true);
    expect(result.anchors).toHaveLength(1);
    const anchor = result.anchors[0]!;
    expect(anchor.queryIntent).toBe("html.element");
    expect(SOURCE.slice(anchor.range.startOffset, anchor.range.endOffset)).toContain(
      "Continue",
    );
  });

  it("resolves attribute and class anchors without accepting selectors", () => {
    const provider = new HtmlIntelligenceProvider();
    const parsed = provider.parse(createDocument(SOURCE), new AbortController().signal);
    const attribute = provider.locators.find(
      ({ id }) => id === P0_SOURCE_LOCATOR_IDS.htmlAttribute,
    )!;
    const classLocator = provider.locators.find(
      ({ id }) => id === P0_SOURCE_LOCATOR_IDS.htmlClass,
    )!;

    const idAnchor = attribute.locate(
      parsed,
      { tagName: "main", attributeName: "id" },
      new AbortController().signal,
    ).anchors[0]!;
    const classAnchors = classLocator.locate(
      parsed,
      { tagName: "button", className: "action" },
      new AbortController().signal,
    ).anchors;

    expect(SOURCE.slice(idAnchor.range.startOffset, idAnchor.range.endOffset)).toBe(
      'id="lesson"',
    );
    expect(classAnchors).toHaveLength(2);
    expect(() =>
      classLocator.locate(
        parsed,
        { selector: ".action", className: "action" },
        new AbortController().signal,
      ),
    ).toThrow('HTML locator input "selector" is not supported.');
  });

  it("returns normalized diagnostics and honors cancellation", () => {
    const provider = new HtmlIntelligenceProvider();
    const parsed = provider.parse(
      createDocument("<html><body><div></body></html>"),
      new AbortController().signal,
    );
    const controller = new AbortController();
    controller.abort();

    expect(parsed.diagnostics.every(({ sourceId }) => sourceId === "parser.parse5")).toBe(
      true,
    );
    expect(() => provider.parse(createDocument(SOURCE), controller.signal)).toThrowError(
      expect.objectContaining({ name: "AbortError" }),
    );
  });
});

function createDocument(content: string): SourceDocument {
  return {
    path: "index.html",
    languageId: "language.html",
    content,
    revision: 1,
  };
}
