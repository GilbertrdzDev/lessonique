import { describe, expect, it } from "vitest";

import type { SourceDocument } from "@/core/code-intelligence";

import { P0_SOURCE_LOCATOR_IDS } from "./ids";
import { JavascriptIntelligenceProvider } from "./javascript-provider";

const SOURCE = `const startLesson = () => {
  console.log("ready");
};

function finishLesson() {
  startLesson();
}

document.addEventListener("DOMContentLoaded", startLesson);
const button = document.querySelector("button");
button.addEventListener("click", finishLesson);`;

describe("JavascriptIntelligenceProvider", () => {
  it("resolves identifiers, functions, and calls by structured names", () => {
    const provider = new JavascriptIntelligenceProvider();
    const parsed = provider.parse(createDocument(SOURCE), new AbortController().signal);
    const identifier = provider.locators.find(
      ({ id }) => id === P0_SOURCE_LOCATOR_IDS.javascriptIdentifier,
    )!;
    const functionLocator = provider.locators.find(
      ({ id }) => id === P0_SOURCE_LOCATOR_IDS.javascriptFunction,
    )!;
    const call = provider.locators.find(
      ({ id }) => id === P0_SOURCE_LOCATOR_IDS.javascriptCall,
    )!;

    expect(identifier.locate(parsed, { name: "button" }, new AbortController().signal).anchors).toHaveLength(2);
    expect(
      functionLocator.locate(
        parsed,
        { name: "finishLesson" },
        new AbortController().signal,
      ).anchors,
    ).toHaveLength(1);
    const consoleCall = call.locate(
      parsed,
      { receiverName: "console", calleeName: "log" },
      new AbortController().signal,
    ).anchors[0]!;
    expect(SOURCE.slice(consoleCall.range.startOffset, consoleCall.range.endOffset)).toBe(
      'console.log("ready")',
    );
  });

  it("resolves event listeners without accepting executable expressions", () => {
    const provider = new JavascriptIntelligenceProvider();
    const parsed = provider.parse(createDocument(SOURCE), new AbortController().signal);
    const locator = provider.locators.find(
      ({ id }) => id === P0_SOURCE_LOCATOR_IDS.javascriptEventListener,
    )!;
    const anchor = locator.locate(
      parsed,
      {
        targetKind: "identifier",
        targetName: "button",
        eventType: "click",
      },
      new AbortController().signal,
    ).anchors[0]!;

    expect(anchor.queryIntent).toBe("javascript.event-listener");
    expect(SOURCE.slice(anchor.range.startOffset, anchor.range.endOffset)).toContain(
      'button.addEventListener("click"',
    );
    expect(() =>
      locator.locate(
        parsed,
        {
          expression: "button.addEventListener('click')",
          targetKind: "identifier",
          targetName: "button",
          eventType: "click",
        },
        new AbortController().signal,
      ),
    ).toThrow('JavaScript locator input "expression" is not supported.');
  });

  it("reports loose-parser recovery and honors cancellation", () => {
    const provider = new JavascriptIntelligenceProvider();
    const invalid = provider.parse(
      createDocument("const result = ;"),
      new AbortController().signal,
    );
    const controller = new AbortController();
    controller.abort();

    expect(invalid.valid).toBe(false);
    expect(invalid.diagnostics[0]).toEqual(
      expect.objectContaining({
        sourceId: "parser.acorn-loose",
        code: "javascript-incomplete-syntax",
      }),
    );
    expect(() => provider.parse(createDocument(SOURCE), controller.signal)).toThrowError(
      expect.objectContaining({ name: "AbortError" }),
    );
  });
});

function createDocument(content: string): SourceDocument {
  return {
    path: "script.js",
    languageId: "language.javascript",
    content,
    revision: 1,
  };
}
