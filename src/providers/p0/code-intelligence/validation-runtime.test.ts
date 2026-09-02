import { describe, expect, it, vi } from "vitest";

import type { ValidationCondition } from "@/core/code-intelligence";
import { createP0WorkspaceRuntime } from "../workspace-runtime";

import { P0_VALIDATOR_IDS } from "./ids";

const FILES = [
  {
    path: "index.html",
    languageId: "language.html",
    content:
      '<main><button id="start" class="action" disabled>Start</button></main>',
    visible: true,
  },
  {
    path: "styles.css",
    languageId: "language.css",
    content:
      ".action { color: red; }\n@media (max-width: 600px) { .action { display: block; } }",
    visible: true,
  },
  {
    path: "script.js",
    languageId: "language.javascript",
    content: `const button = document.querySelector("button");
function startLesson() {}
startLesson();
button.addEventListener("click", startLesson);`,
    visible: true,
  },
] as const;

describe("P0 validation runtime", () => {
  it("evaluates every declared P0 condition with bounded evidence", async () => {
    const runtime = createP0WorkspaceRuntime();
    await runtime.controller.activateProfile("profile.vanilla-web");
    await runtime.controller.replaceFiles(FILES);
    runtime.controller.replaceConsoleEntries([
      {
        id: "console.1",
        kind: "log",
        message: "lesson ready",
        occurredAt: "2026-08-30T00:00:00.000Z",
      },
    ]);
    vi.spyOn(runtime.previewSurfaceAdapter, "targetExists").mockResolvedValue(true);

    const conditions: ValidationCondition[] = [
      condition(P0_VALIDATOR_IDS.fileExists, { filePath: "index.html" }),
      condition(P0_VALIDATOR_IDS.textExists, {
        filePath: "index.html",
        text: "Start",
      }),
      condition(P0_VALIDATOR_IDS.htmlElementExists, {
        filePath: "index.html",
        tagName: "button",
      }),
      condition(P0_VALIDATOR_IDS.htmlAttributeExists, {
        filePath: "index.html",
        tagName: "button",
        attributeName: "disabled",
      }),
      condition(P0_VALIDATOR_IDS.htmlClassExists, {
        filePath: "index.html",
        tagName: "button",
        className: "action",
      }),
      condition(P0_VALIDATOR_IDS.cssRuleExists, {
        filePath: "styles.css",
        selectorKind: "class",
        selectorName: "action",
      }),
      condition(P0_VALIDATOR_IDS.cssPropertyExists, {
        filePath: "styles.css",
        selectorKind: "class",
        selectorName: "action",
        propertyName: "color",
      }),
      condition(P0_VALIDATOR_IDS.cssMediaQueryExists, {
        filePath: "styles.css",
        feature: "max-width",
        value: "600px",
      }),
      condition(P0_VALIDATOR_IDS.javascriptIdentifierExists, {
        filePath: "script.js",
        name: "button",
      }),
      condition(P0_VALIDATOR_IDS.javascriptFunctionExists, {
        filePath: "script.js",
        name: "startLesson",
      }),
      condition(P0_VALIDATOR_IDS.javascriptCallExists, {
        filePath: "script.js",
        calleeName: "startLesson",
      }),
      condition(P0_VALIDATOR_IDS.javascriptEventListenerExists, {
        filePath: "script.js",
        eventType: "click",
        targetKind: "identifier",
        targetName: "button",
      }),
      condition(P0_VALIDATOR_IDS.previewElementExists, {
        filePath: "index.html",
        tagName: "button",
        className: "action",
      }),
      condition(P0_VALIDATOR_IDS.consoleOutputMatches, {
        text: "ready",
        mode: "ends-with",
        kind: "log",
      }),
      condition(P0_VALIDATOR_IDS.noConsoleErrors, {}),
    ];

    const results = [];
    for (const entry of conditions) {
      results.push(await runtime.validation.engine.evaluate(entry));
    }

    expect(runtime.registries.validators.list()).toHaveLength(15);
    expect(runtime.validation.validators.list()).toHaveLength(15);
    expect(results.map(({ status }) => status)).toEqual(
      Array.from({ length: 15 }, () => "passed"),
    );
    results.forEach((result) => {
      expect(result.evidence.length).toBeGreaterThan(0);
      expect(JSON.stringify(result)).not.toMatch(/selector|xpath|domnode/iu);
    });
    expect(runtime.validation.results.list()).toHaveLength(15);
    expect(runtime.validation.results.get(conditions[0]!.id)).toEqual(results[0]);
    await runtime.dispose();
  });

  it("re-evaluates local waits on workspace changes and supports cancellation", async () => {
    const runtime = createP0WorkspaceRuntime();
    await runtime.controller.activateProfile("profile.vanilla-web");
    const waitCondition = condition(P0_VALIDATOR_IDS.textExists, {
      filePath: "script.js",
      text: "lessonReady",
    });

    const waiting = runtime.validation.engine.waitFor(
      waitCondition,
      { timeoutMs: 1000 },
    );
    await nextTask();
    await runtime.controller.updateFileContent(
      "script.js",
      "const lessonReady = true;",
    );

    await expect(waiting).resolves.toEqual(
      expect.objectContaining({
        status: "satisfied",
        result: expect.objectContaining({ status: "passed" }),
      }),
    );

    const abortController = new AbortController();
    const cancelled = runtime.validation.engine.waitFor(
      condition(P0_VALIDATOR_IDS.textExists, {
        filePath: "script.js",
        text: "neverAppears",
      }),
      { timeoutMs: 1000 },
      abortController.signal,
    );
    await nextTask();
    abortController.abort();
    await expect(cancelled).resolves.toEqual(
      expect.objectContaining({ status: "cancelled" }),
    );
    await runtime.dispose();
  });

  it("returns failed evidence and a bounded wait timeout", async () => {
    const runtime = createP0WorkspaceRuntime();
    await runtime.controller.activateProfile("profile.vanilla-web");
    runtime.controller.replaceConsoleEntries([
      {
        id: "console.error",
        kind: "error",
        message: "ReferenceError",
        occurredAt: "2026-08-30T00:00:00.000Z",
      },
    ]);

    const failed = await runtime.validation.engine.evaluate(
      condition(P0_VALIDATOR_IDS.noConsoleErrors, {}),
    );
    const timedOut = await runtime.validation.engine.waitFor(
      condition(P0_VALIDATOR_IDS.textExists, {
        filePath: "script.js",
        text: "not-present",
      }),
      { timeoutMs: 10 },
    );

    expect(failed).toEqual(
      expect.objectContaining({
        status: "failed",
        evidence: [expect.objectContaining({ observed: 1, expected: 0 })],
      }),
    );
    expect(timedOut).toEqual(
      expect.objectContaining({
        status: "timed-out",
        result: expect.objectContaining({ status: "failed" }),
      }),
    );
    await runtime.dispose();
  });
});

function condition(
  validatorId: string,
  input: ValidationCondition["input"],
): ValidationCondition {
  return { id: `condition.${validatorId.slice("validator.".length)}`, validatorId, input };
}

function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
