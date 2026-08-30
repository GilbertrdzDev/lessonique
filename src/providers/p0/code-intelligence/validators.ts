import type {
  CodeIntelligenceService,
  ExecutableValidator,
  ValidationCondition,
  ValidationEvidence,
  ValidationResult,
} from "@/core/code-intelligence";
import type { TargetRef } from "@/core/platform/contracts";
import type { JsonValue } from "@/core/platform/json-schema";
import type { WorkspaceStateReader } from "@/core/workspace";

import { P0_SOURCE_LOCATOR_IDS, P0_VALIDATOR_IDS } from "./ids";

export interface PreviewValidationPort {
  targetExists(target: TargetRef, signal: AbortSignal): Promise<boolean>;
}

export interface P0ValidatorDependencies {
  workspace: WorkspaceStateReader;
  intelligence: CodeIntelligenceService;
  preview: PreviewValidationPort;
  now?: () => string;
}

export function createP0ExecutableValidators(
  dependencies: P0ValidatorDependencies,
): ExecutableValidator[] {
  const now = dependencies.now ?? (() => new Date().toISOString());
  const result = (
    condition: ValidationCondition,
    status: ValidationResult["status"],
    evidence: readonly ValidationEvidence[],
    diagnostics: ValidationResult["diagnostics"] = [],
  ): ValidationResult => ({
    conditionId: condition.id,
    validatorId: condition.validatorId,
    status,
    evidence,
    diagnostics,
    evaluatedAt: now(),
  });
  const source = (
    id: string,
    locatorId: string,
    transform: (input: ValidationCondition["input"]) => Record<string, JsonValue> =
      withoutFilePath,
  ): ExecutableValidator => ({
    id,
    async evaluate(condition, signal) {
      const filePath = readFilePath(condition);
      const file = dependencies.workspace
        .getSnapshot()
        .files.find(({ path }) => path === filePath);
      if (!file) {
        return result(condition, "failed", [
          {
            kind: "workspace",
            summary: `Workspace file "${filePath}" does not exist.`,
            filePath,
            observed: false,
            expected: true,
          },
        ]);
      }
      const query = await dependencies.intelligence.query(
        {
          document: {
            path: file.path,
            languageId: file.languageId,
            content: file.content,
            revision: dependencies.workspace.getSnapshot().environmentRevision,
          },
          locator: { locatorId, input: transform(condition.input) },
        },
        signal,
      );
      const passed = query.anchors.length > 0;
      return result(
        condition,
        passed ? "passed" : "failed",
        [
          {
            kind: "source",
            summary: passed
              ? `Found ${query.anchors.length} matching source anchor${query.anchors.length === 1 ? "" : "s"}.`
              : "No matching source anchor was found.",
            filePath,
            ...(query.anchors[0] ? { anchorId: query.anchors[0].id } : {}),
            observed: query.anchors.length,
            expected: true,
          },
        ],
        query.diagnostics,
      );
    },
  });

  return [
    {
      id: P0_VALIDATOR_IDS.fileExists,
      evaluate(condition) {
        const filePath = readFilePath(condition);
        const exists = dependencies.workspace
          .getSnapshot()
          .files.some(({ path }) => path === filePath);
        return result(condition, exists ? "passed" : "failed", [
          {
            kind: "workspace",
            summary: exists
              ? `Workspace file "${filePath}" exists.`
              : `Workspace file "${filePath}" does not exist.`,
            filePath,
            observed: exists,
            expected: true,
          },
        ]);
      },
    },
    {
      id: P0_VALIDATOR_IDS.textExists,
      evaluate(condition) {
        const filePath = readFilePath(condition);
        const expected = readString(condition.input, "text");
        const caseSensitive = condition.input.caseSensitive !== false;
        const file = dependencies.workspace
          .getSnapshot()
          .files.find(({ path }) => path === filePath);
        const source = caseSensitive ? file?.content : file?.content.toLowerCase();
        const needle = caseSensitive ? expected : expected.toLowerCase();
        const exists = source?.includes(needle) ?? false;
        return result(condition, exists ? "passed" : "failed", [
          {
            kind: "source",
            summary: exists
              ? `The requested text exists in "${filePath}".`
              : `The requested text was not found in "${filePath}".`,
            filePath,
            observed: exists,
            expected: true,
          },
        ]);
      },
    },
    source(P0_VALIDATOR_IDS.htmlElementExists, P0_SOURCE_LOCATOR_IDS.htmlElement),
    source(
      P0_VALIDATOR_IDS.htmlAttributeExists,
      P0_SOURCE_LOCATOR_IDS.htmlAttribute,
    ),
    source(P0_VALIDATOR_IDS.htmlClassExists, P0_SOURCE_LOCATOR_IDS.htmlClass),
    source(P0_VALIDATOR_IDS.cssRuleExists, P0_SOURCE_LOCATOR_IDS.cssRule),
    source(P0_VALIDATOR_IDS.cssPropertyExists, P0_SOURCE_LOCATOR_IDS.cssProperty),
    source(
      P0_VALIDATOR_IDS.cssMediaQueryExists,
      P0_SOURCE_LOCATOR_IDS.cssMediaQuery,
    ),
    source(
      P0_VALIDATOR_IDS.javascriptIdentifierExists,
      P0_SOURCE_LOCATOR_IDS.javascriptIdentifier,
    ),
    source(
      P0_VALIDATOR_IDS.javascriptFunctionExists,
      P0_SOURCE_LOCATOR_IDS.javascriptFunction,
    ),
    source(
      P0_VALIDATOR_IDS.javascriptCallExists,
      P0_SOURCE_LOCATOR_IDS.javascriptCall,
    ),
    source(
      P0_VALIDATOR_IDS.javascriptEventListenerExists,
      P0_SOURCE_LOCATOR_IDS.javascriptEventListener,
    ),
    {
      id: P0_VALIDATOR_IDS.previewElementExists,
      async evaluate(condition, signal) {
        const filePath = readFilePath(condition);
        const file = dependencies.workspace
          .getSnapshot()
          .files.find(({ path }) => path === filePath);
        if (!file) {
          return result(condition, "failed", [
            {
              kind: "preview",
              summary: `Preview source file "${filePath}" does not exist.`,
              filePath,
              observed: false,
              expected: true,
            },
          ]);
        }
        const { locatorId, input } = previewLocator(condition.input);
        const query = await dependencies.intelligence.query(
          {
            document: {
              path: file.path,
              languageId: file.languageId,
              content: file.content,
              revision: dependencies.workspace.getSnapshot().environmentRevision,
            },
            locator: { locatorId, input },
            representation: "preview",
          },
          signal,
        );
        const mappings = query.targets.filter(
          ({ representation }) => representation === "preview",
        );
        let exists = false;
        for (const mapping of mappings) {
          if (await dependencies.preview.targetExists(mapping.target, signal)) {
            exists = true;
            break;
          }
        }
        return result(
          condition,
          exists ? "passed" : "failed",
          [
            {
              kind: "preview",
              summary: exists
                ? "The source-derived preview element is rendered."
                : "The source-derived preview element is not rendered.",
              filePath,
              ...(query.anchors[0] ? { anchorId: query.anchors[0].id } : {}),
              observed: exists,
              expected: true,
            },
          ],
          query.diagnostics,
        );
      },
    },
    {
      id: P0_VALIDATOR_IDS.consoleOutputMatches,
      evaluate(condition) {
        const expected = readString(condition.input, "text");
        const mode = condition.input.mode ?? "contains";
        const kind = condition.input.kind;
        const entries = dependencies.workspace
          .getSnapshot()
          .consoleEntries.filter((entry) => !kind || entry.kind === kind);
        const matching = entries.find(({ message }) =>
          matchesLimitedText(message, expected, mode),
        );
        return result(condition, matching ? "passed" : "failed", [
          {
            kind: "console",
            summary: matching
              ? `Console entry "${matching.id}" matched the requested text.`
              : "No console entry matched the requested text.",
            observed: matching?.message ?? null,
            expected,
          },
        ]);
      },
    },
    {
      id: P0_VALIDATOR_IDS.noConsoleErrors,
      evaluate(condition) {
        const state = dependencies.workspace.getSnapshot();
        const errors = state.consoleEntries.filter(({ kind }) => kind === "error");
        const passed = errors.length === 0 && state.runtime.status !== "error";
        return result(condition, passed ? "passed" : "failed", [
          {
            kind: "console",
            summary: passed
              ? "No console or runtime errors were found."
              : `${errors.length} console error${errors.length === 1 ? " was" : "s were"} found.`,
            observed: errors.length,
            expected: 0,
          },
        ]);
      },
    },
  ];
}

function readFilePath(condition: ValidationCondition): string {
  return condition.filePath ?? readString(condition.input, "filePath");
}

function readString(
  input: Readonly<Record<string, JsonValue>>,
  key: string,
): string {
  const value = input[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Validator input "${key}" must be a non-empty string.`);
  }
  return value;
}

function withoutFilePath(
  input: Readonly<Record<string, JsonValue>>,
): Record<string, JsonValue> {
  return Object.fromEntries(
    Object.entries(input).filter(([key]) => key !== "filePath"),
  );
}

function previewLocator(
  source: Readonly<Record<string, JsonValue>>,
): { locatorId: string; input: Record<string, JsonValue> } {
  const input = withoutFilePath(source);
  if (typeof input.className === "string") {
    return { locatorId: P0_SOURCE_LOCATOR_IDS.htmlClass, input };
  }
  if (typeof input.attributeName === "string") {
    return { locatorId: P0_SOURCE_LOCATOR_IDS.htmlAttribute, input };
  }
  return { locatorId: P0_SOURCE_LOCATOR_IDS.htmlElement, input };
}

function matchesLimitedText(
  message: string,
  expected: string,
  mode: JsonValue,
): boolean {
  switch (mode) {
    case "equals":
      return message === expected;
    case "starts-with":
      return message.startsWith(expected);
    case "ends-with":
      return message.endsWith(expected);
    case "contains":
      return message.includes(expected);
    default:
      throw new Error("Console match mode is not supported.");
  }
}
