import type {
  AnyNode,
  CallExpression,
  Node,
  Program,
} from "acorn";
import { isDummy, parse } from "acorn-loose";

import type {
  LanguageIntelligenceProvider,
  NormalizedDiagnostic,
  ParsedSourceDocument,
  SourceAnchor,
  SourceLocator,
  SourceLocatorResult,
} from "@/core/code-intelligence";
import type { JsonValue } from "@/core/platform/json-schema";

import { P0_LANGUAGE_IDS } from "../provider-platform";
import { P0_SOURCE_LOCATOR_IDS } from "./ids";

type JavascriptLocatorKind = "identifier" | "function" | "call" | "event-listener";

export class JavascriptIntelligenceProvider
  implements LanguageIntelligenceProvider<Program>
{
  readonly languageId = P0_LANGUAGE_IDS.javascript;
  readonly locators = [
    new JavascriptSourceLocator(P0_SOURCE_LOCATOR_IDS.javascriptIdentifier, "identifier"),
    new JavascriptSourceLocator(P0_SOURCE_LOCATOR_IDS.javascriptFunction, "function"),
    new JavascriptSourceLocator(P0_SOURCE_LOCATOR_IDS.javascriptCall, "call"),
    new JavascriptSourceLocator(
      P0_SOURCE_LOCATOR_IDS.javascriptEventListener,
      "event-listener",
    ),
  ];
  readonly locatorIds = this.locators.map(({ id }) => id);
  readonly validatorIds: readonly string[] = [];

  parse(
    document: Parameters<LanguageIntelligenceProvider<Program>["parse"]>[0],
    signal: AbortSignal,
  ): ParsedSourceDocument<Program> {
    throwIfAborted(signal);
    const tree = parse(document.content, {
      ecmaVersion: "latest",
      sourceType: "module",
    });
    const diagnostics: NormalizedDiagnostic[] = [];
    visitNodes(tree, signal, (node) => {
      if (isDummy(node)) {
        diagnostics.push({
          id: `diagnostic.javascript:${document.path}:${node.start}`,
          sourceId: "parser.acorn-loose",
          severity: "error",
          message: "JavaScript source is incomplete near this position.",
          code: "javascript-incomplete-syntax",
          filePath: document.path,
          range: { startOffset: node.start, endOffset: node.end },
        });
      }
    });
    return {
      document: structuredClone(document),
      tree,
      valid: diagnostics.length === 0,
      diagnostics,
    };
  }
}

class JavascriptSourceLocator implements SourceLocator<Program> {
  readonly id: string;
  readonly languageId = P0_LANGUAGE_IDS.javascript;
  readonly #kind: JavascriptLocatorKind;

  constructor(id: string, kind: JavascriptLocatorKind) {
    this.id = id;
    this.#kind = kind;
  }

  locate(
    parsed: ParsedSourceDocument<Program>,
    input: Readonly<Record<string, JsonValue>>,
    signal: AbortSignal,
  ): SourceLocatorResult {
    if (!parsed.tree) {
      return { documentRevision: parsed.document.revision, anchors: [] };
    }
    const query = readQuery(this.#kind, input);
    const matches: AnyNode[] = [];
    visitNodes(parsed.tree, signal, (node) => {
      if (matchesQuery(node, this.#kind, query)) matches.push(node);
    });
    const selected =
      query.occurrence === undefined
        ? matches
        : matches[query.occurrence]
          ? [matches[query.occurrence]]
          : [];
    return {
      documentRevision: parsed.document.revision,
      anchors: selected.map((node, index) =>
        createAnchor(
          parsed,
          this.id,
          this.#kind,
          query,
          node,
          query.occurrence ?? index,
        ),
      ),
    };
  }
}

type JavascriptQuery = {
  name?: string;
  calleeName?: string;
  receiverName?: string;
  eventType?: string;
  targetKind?: "document" | "window" | "identifier";
  targetName?: string;
  occurrence?: number;
};

function readQuery(
  kind: JavascriptLocatorKind,
  input: Readonly<Record<string, JsonValue>>,
): JavascriptQuery {
  const allowed = new Set([
    "occurrence",
    ...(kind === "identifier" || kind === "function" ? ["name"] : []),
    ...(kind === "call" ? ["calleeName", "receiverName"] : []),
    ...(kind === "event-listener" ? ["eventType", "targetKind", "targetName"] : []),
  ]);
  Object.keys(input).forEach((key) => {
    if (!allowed.has(key)) {
      throw new Error(`JavaScript locator input "${key}" is not supported.`);
    }
  });
  const occurrence = readOccurrence(input);
  if (kind === "identifier" || kind === "function") {
    return {
      name: readIdentifier(input, "name"),
      ...(occurrence !== undefined ? { occurrence } : {}),
    };
  }
  if (kind === "call") {
    return {
      calleeName: readIdentifier(input, "calleeName"),
      ...(input.receiverName
        ? { receiverName: readIdentifier(input, "receiverName") }
        : {}),
      ...(occurrence !== undefined ? { occurrence } : {}),
    };
  }
  const targetKind = input.targetKind;
  if (
    targetKind !== "document" &&
    targetKind !== "window" &&
    targetKind !== "identifier"
  ) {
    throw new Error(
      'JavaScript locator input "targetKind" must be "document", "window", or "identifier".',
    );
  }
  return {
    eventType: readString(input, "eventType"),
    targetKind,
    ...(targetKind === "identifier"
      ? { targetName: readIdentifier(input, "targetName") }
      : {}),
    ...(occurrence !== undefined ? { occurrence } : {}),
  };
}

function matchesQuery(
  node: AnyNode,
  kind: JavascriptLocatorKind,
  query: JavascriptQuery,
): boolean {
  if (kind === "identifier") {
    return node.type === "Identifier" && node.name === query.name && !isDummy(node);
  }
  if (kind === "function") return matchesFunction(node, query.name ?? "");
  if (node.type !== "CallExpression") return false;
  return kind === "call"
    ? matchesCall(node, query)
    : matchesEventListener(node, query);
}

function matchesFunction(node: AnyNode, name: string): boolean {
  if (node.type === "FunctionDeclaration") return node.id?.name === name;
  return (
    node.type === "VariableDeclarator" &&
    node.id.type === "Identifier" &&
    node.id.name === name &&
    (node.init?.type === "FunctionExpression" || node.init?.type === "ArrowFunctionExpression")
  );
}

function matchesCall(node: CallExpression, query: JavascriptQuery): boolean {
  const callee = node.callee;
  if (callee.type === "Identifier") {
    return !query.receiverName && callee.name === query.calleeName;
  }
  if (callee.type !== "MemberExpression" || callee.computed) return false;
  return (
    identifierName(callee.property) === query.calleeName &&
    (!query.receiverName || identifierName(callee.object) === query.receiverName)
  );
}

function matchesEventListener(
  node: CallExpression,
  query: JavascriptQuery,
): boolean {
  const callee = node.callee;
  if (
    callee.type !== "MemberExpression" ||
    callee.computed ||
    identifierName(callee.property) !== "addEventListener"
  ) {
    return false;
  }
  const firstArgument = node.arguments[0];
  if (
    !firstArgument ||
    firstArgument.type !== "Literal" ||
    firstArgument.value !== query.eventType
  ) {
    return false;
  }
  const expectedTarget =
    query.targetKind === "identifier" ? query.targetName : query.targetKind;
  return identifierName(callee.object) === expectedTarget;
}

function identifierName(node: Node): string | undefined {
  return node.type === "Identifier" && "name" in node && typeof node.name === "string"
    ? node.name
    : undefined;
}

function visitNodes(
  node: Node,
  signal: AbortSignal,
  visitor: (node: AnyNode) => void,
): void {
  throwIfAborted(signal);
  visitor(node as AnyNode);
  Object.entries(node).forEach(([key, value]) => {
    if (key === "start" || key === "end" || key === "loc") return;
    if (isNode(value)) visitNodes(value, signal, visitor);
    else if (Array.isArray(value)) {
      value.forEach((entry) => {
        if (isNode(entry)) visitNodes(entry, signal, visitor);
      });
    }
  });
}

function isNode(value: unknown): value is Node {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string" &&
    "start" in value &&
    "end" in value
  );
}

function createAnchor(
  parsed: ParsedSourceDocument<Program>,
  locatorId: string,
  kind: JavascriptLocatorKind,
  query: JavascriptQuery,
  node: AnyNode,
  occurrence: number,
): SourceAnchor {
  const signature =
    kind === "call"
      ? `${query.receiverName ? `${query.receiverName}.` : ""}${query.calleeName}`
      : kind === "event-listener"
        ? `${query.targetKind}:${query.targetName ?? query.targetKind}/${query.eventType}`
        : query.name;
  return {
    id: `anchor.javascript:${parsed.document.path}:${locatorId}:${node.start}:${node.end}`,
    languageProviderId: P0_LANGUAGE_IDS.javascript,
    locatorId,
    filePath: parsed.document.path,
    range: { startOffset: node.start, endOffset: node.end },
    queryIntent: `javascript.${kind}`,
    disambiguation: { occurrence, signature },
    sourceRevision: parsed.document.revision,
  };
}

function readIdentifier(
  input: Readonly<Record<string, JsonValue>>,
  key: string,
): string {
  const value = input[key];
  if (typeof value !== "string" || !/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(value)) {
    throw new Error(`JavaScript locator input "${key}" must be an identifier.`);
  }
  return value;
}

function readString(
  input: Readonly<Record<string, JsonValue>>,
  key: string,
): string {
  const value = input[key];
  if (typeof value !== "string" || value.trim() === "" || value.length > 128) {
    throw new Error(
      `JavaScript locator input "${key}" must be a non-empty string of at most 128 characters.`,
    );
  }
  return value;
}

function readOccurrence(
  input: Readonly<Record<string, JsonValue>>,
): number | undefined {
  const value = input.occurrence;
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(
      'JavaScript locator input "occurrence" must be a non-negative integer.',
    );
  }
  return value;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException("JavaScript parsing was cancelled.", "AbortError");
  }
}
