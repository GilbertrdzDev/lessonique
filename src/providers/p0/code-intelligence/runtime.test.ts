import { describe, expect, it } from "vitest";

import type { SourceDocument } from "@/core/code-intelligence";
import { createP0ProviderPlatform, P0_TARGET_RESOLVER_IDS } from "../provider-platform";

import { P0_SOURCE_LOCATOR_IDS } from "./ids";
import { createP0CodeIntelligenceRuntime } from "./runtime";

const HTML_SOURCE = `<!doctype html>
<main>
  <button class="action">First</button>
  <button class="action">Second</button>
</main>`;

describe("P0 code intelligence runtime", () => {
  it("queries registered providers and maps source anchors to editor and preview targets", async () => {
    const platform = createP0ProviderPlatform();
    const runtime = createP0CodeIntelligenceRuntime(platform, { debounceMs: 0 });
    const result = await runtime.service.query({
      document: createDocument("index.html", "language.html", HTML_SOURCE),
      locator: {
        locatorId: P0_SOURCE_LOCATOR_IDS.htmlClass,
        input: { tagName: "button", className: "action", occurrence: 1 },
      },
    });

    expect(result.anchors).toHaveLength(1);
    expect(result.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          representation: "editor",
          target: {
            resolverId: P0_TARGET_RESOLVER_IDS.codeRange,
            input: expect.objectContaining({
              filePath: "index.html",
              startLine: 4,
              startColumn: 11,
            }),
          },
        }),
        expect.objectContaining({
          representation: "preview",
          target: {
            resolverId: P0_TARGET_RESOLVER_IDS.previewAnchor,
            input: { anchorId: expect.stringMatching(/^source\.[a-f0-9]{8}$/u) },
          },
        }),
      ]),
    );
    const previewTarget = result.targets.find(
      ({ representation }) => representation === "preview",
    )!;
    const queryId = String(previewTarget.target.input.anchorId);
    expect(runtime.previewQueries.get(queryId)).toEqual({
      kind: "html-element",
      tagName: "button",
      className: "action",
      occurrence: 1,
    });
    expect(JSON.stringify(runtime.previewQueries.get(queryId))).not.toMatch(
      /selector|xpath|dompath/iu,
    );
    runtime.dispose();
  });

  it("validates closed locator inputs before parsing", async () => {
    const runtime = createP0CodeIntelligenceRuntime(createP0ProviderPlatform(), {
      debounceMs: 0,
    });

    await expect(
      runtime.service.query({
        document: createDocument("index.html", "language.html", HTML_SOURCE),
        locator: {
          locatorId: P0_SOURCE_LOCATOR_IDS.htmlElement,
          input: { tagName: "button", selector: "button.action" },
        },
      }),
    ).rejects.toThrow('unsupported property "selector"');
    runtime.dispose();
  });

  it("maps non-preview languages only to registered editor targets", async () => {
    const runtime = createP0CodeIntelligenceRuntime(createP0ProviderPlatform(), {
      debounceMs: 0,
    });
    const result = await runtime.service.query({
      document: createDocument(
        "script.js",
        "language.javascript",
        "function startLesson() {}",
      ),
      locator: {
        locatorId: P0_SOURCE_LOCATOR_IDS.javascriptFunction,
        input: { name: "startLesson" },
      },
    });

    expect(result.targets).toHaveLength(1);
    expect(result.targets[0]).toEqual(
      expect.objectContaining({
        representation: "editor",
        target: expect.objectContaining({
          resolverId: P0_TARGET_RESOLVER_IDS.codeRange,
        }),
      }),
    );
    runtime.dispose();
  });

  it("publishes parser diagnostics as editor marker snapshots", async () => {
    const runtime = createP0CodeIntelligenceRuntime(createP0ProviderPlatform(), {
      debounceMs: 0,
    });

    const result = await runtime.service.query({
      document: createDocument("styles.css", "language.css", ".card { color:"),
      locator: {
        locatorId: P0_SOURCE_LOCATOR_IDS.cssRule,
        input: { selectorKind: "class", selectorName: "card" },
      },
    });

    expect(result.diagnostics).toHaveLength(1);
    expect(runtime.diagnostics.get("styles.css")).toEqual(
      expect.objectContaining({
        sourceRevision: 7,
        diagnostics: [expect.objectContaining({ severity: "error" })],
        markers: [
          expect.objectContaining({
            severity: "error",
            startLine: 1,
          }),
        ],
      }),
    );
    runtime.dispose();
  });
});

function createDocument(
  path: string,
  languageId: string,
  content: string,
): SourceDocument {
  return { path, languageId, content, revision: 7 };
}
