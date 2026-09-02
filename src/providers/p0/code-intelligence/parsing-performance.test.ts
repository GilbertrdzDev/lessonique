import { describe, expect, it } from "vitest";

import type { SourceDocument } from "@/core/code-intelligence";

import { CssIntelligenceProvider } from "./css-provider";
import { HtmlIntelligenceProvider } from "./html-provider";
import { JavascriptIntelligenceProvider } from "./javascript-provider";

describe("P0 parsing performance", () => {
  it("parses representative near-limit documents within a bounded budget", async () => {
    const fixtures = [
      {
        provider: new HtmlIntelligenceProvider(),
        document: document(
          "index.html",
          "language.html",
          `<!doctype html><html><body><main>${Array.from({ length: 1000 }, (_, index) => `<button class="item">Item ${index}</button>`).join("")}</main></body></html>`,
        ),
      },
      {
        provider: new CssIntelligenceProvider(),
        document: document(
          "styles.css",
          "language.css",
          Array.from(
            { length: 1000 },
            (_, index) => `.item-${index} { color: red; }`,
          ).join("\n"),
        ),
      },
      {
        provider: new JavascriptIntelligenceProvider(),
        document: document(
          "script.js",
          "language.javascript",
          Array.from(
            { length: 1000 },
            (_, index) => `const item${index} = ${index};`,
          ).join("\n"),
        ),
      },
    ];

    const startedAt = performance.now();
    for (const { provider, document: source } of fixtures) {
      expect(source.content.length).toBeLessThanOrEqual(50 * 1024);
      const parsed = await provider.parse(source, new AbortController().signal);
      expect(parsed.valid).toBe(true);
      expect(parsed.tree).toBeDefined();
    }
    const elapsedMs = performance.now() - startedAt;

    expect(elapsedMs).toBeLessThan(2000);
  });
});

function document(
  path: string,
  languageId: string,
  content: string,
): SourceDocument {
  return { path, languageId, content, revision: 1 };
}
