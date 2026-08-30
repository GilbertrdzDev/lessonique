import {
  parse,
  type DefaultTreeAdapterTypes,
  type ParserError,
} from "parse5";

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

export type HtmlSyntaxTree = DefaultTreeAdapterTypes.Document;

type HtmlLocatorKind = "element" | "attribute" | "class";

export class HtmlIntelligenceProvider
  implements LanguageIntelligenceProvider<HtmlSyntaxTree>
{
  readonly languageId = P0_LANGUAGE_IDS.html;
  readonly locators = [
    new HtmlSourceLocator(P0_SOURCE_LOCATOR_IDS.htmlElement, "element"),
    new HtmlSourceLocator(P0_SOURCE_LOCATOR_IDS.htmlAttribute, "attribute"),
    new HtmlSourceLocator(P0_SOURCE_LOCATOR_IDS.htmlClass, "class"),
  ];
  readonly locatorIds = this.locators.map(({ id }) => id);
  readonly validatorIds: readonly string[] = [];

  parse(
    document: Parameters<LanguageIntelligenceProvider<HtmlSyntaxTree>["parse"]>[0],
    signal: AbortSignal,
  ): ParsedSourceDocument<HtmlSyntaxTree> {
    throwIfAborted(signal);
    const parserErrors: ParserError[] = [];
    const tree = parse(document.content, {
      sourceCodeLocationInfo: true,
      onParseError: (error) => parserErrors.push(error),
    });
    throwIfAborted(signal);
    return {
      document: structuredClone(document),
      tree,
      valid: parserErrors.length === 0,
      diagnostics: parserErrors.map((error, index) =>
        toDiagnostic(document.path, error, index),
      ),
    };
  }
}

class HtmlSourceLocator implements SourceLocator<HtmlSyntaxTree> {
  readonly id: string;
  readonly languageId = P0_LANGUAGE_IDS.html;
  readonly #kind: HtmlLocatorKind;

  constructor(id: string, kind: HtmlLocatorKind) {
    this.id = id;
    this.#kind = kind;
  }

  locate(
    parsed: ParsedSourceDocument<HtmlSyntaxTree>,
    input: Readonly<Record<string, JsonValue>>,
    signal: AbortSignal,
  ): SourceLocatorResult {
    if (!parsed.tree) {
      return { documentRevision: parsed.document.revision, anchors: [] };
    }
    const query = readQuery(this.#kind, input);
    const matches: Array<{
      element: DefaultTreeAdapterTypes.Element;
      range: { startOffset: number; endOffset: number };
    }> = [];
    visitElements(parsed.tree, signal, (element) => {
      if (!matchesElement(element, query.tagName, query.id)) return;
      const range = resolveRange(element, this.#kind, query);
      if (range) matches.push({ element, range });
    });
    const selected =
      query.occurrence === undefined
        ? matches
        : matches[query.occurrence]
          ? [matches[query.occurrence]]
          : [];
    return {
      documentRevision: parsed.document.revision,
      anchors: selected.map(({ element, range }, occurrence) =>
        createAnchor(
          parsed,
          this.id,
          this.#kind,
          element,
          range,
          query.occurrence ?? occurrence,
        ),
      ),
    };
  }
}

type HtmlQuery = {
  tagName?: string;
  id?: string;
  attributeName?: string;
  className?: string;
  occurrence?: number;
};

function readQuery(
  kind: HtmlLocatorKind,
  input: Readonly<Record<string, JsonValue>>,
): HtmlQuery {
  const allowed = new Set([
    "tagName",
    "id",
    "occurrence",
    ...(kind === "attribute" ? ["attributeName"] : []),
    ...(kind === "class" ? ["className"] : []),
  ]);
  Object.keys(input).forEach((key) => {
    if (!allowed.has(key)) {
      throw new Error(`HTML locator input "${key}" is not supported.`);
    }
  });
  const query: HtmlQuery = {
    ...(readOptionalString(input, "tagName")
      ? { tagName: readOptionalString(input, "tagName")?.toLowerCase() }
      : {}),
    ...(readOptionalString(input, "id") ? { id: readOptionalString(input, "id") } : {}),
    ...(readOptionalOccurrence(input) !== undefined
      ? { occurrence: readOptionalOccurrence(input) }
      : {}),
  };
  if (kind === "element" && !query.tagName && !query.id) {
    throw new Error("HTML element locators require tagName or id.");
  }
  if (kind === "attribute") {
    query.attributeName = readRequiredString(input, "attributeName").toLowerCase();
  }
  if (kind === "class") {
    query.className = readRequiredString(input, "className");
  }
  return query;
}

function matchesElement(
  element: DefaultTreeAdapterTypes.Element,
  tagName: string | undefined,
  id: string | undefined,
): boolean {
  return (
    (!tagName || element.tagName === tagName) &&
    (!id || element.attrs.some((attribute) => attribute.name === "id" && attribute.value === id))
  );
}

function resolveRange(
  element: DefaultTreeAdapterTypes.Element,
  kind: HtmlLocatorKind,
  query: HtmlQuery,
): { startOffset: number; endOffset: number } | undefined {
  const location = element.sourceCodeLocation;
  if (!location) return undefined;
  if (kind === "element") {
    return { startOffset: location.startOffset, endOffset: location.endOffset };
  }
  const attributeName = kind === "attribute" ? query.attributeName : "class";
  if (!attributeName) return undefined;
  const attribute = element.attrs.find(({ name }) => name === attributeName);
  if (!attribute) return undefined;
  if (
    kind === "class" &&
    !attribute.value.split(/\s+/u).includes(query.className ?? "")
  ) {
    return undefined;
  }
  const attributeLocation = location.attrs?.[attributeName];
  return attributeLocation
    ? {
        startOffset: attributeLocation.startOffset,
        endOffset: attributeLocation.endOffset,
      }
    : undefined;
}

function visitElements(
  node: DefaultTreeAdapterTypes.Node,
  signal: AbortSignal,
  visitor: (element: DefaultTreeAdapterTypes.Element) => void,
): void {
  throwIfAborted(signal);
  if (isElement(node)) visitor(node);
  if ("childNodes" in node) {
    node.childNodes.forEach((child) => visitElements(child, signal, visitor));
  }
  if (isElement(node) && node.tagName === "template" && "content" in node) {
    visitElements(node.content, signal, visitor);
  }
}

function isElement(
  node: DefaultTreeAdapterTypes.Node,
): node is DefaultTreeAdapterTypes.Element {
  return "tagName" in node && Array.isArray(node.attrs);
}

function createAnchor(
  parsed: ParsedSourceDocument<HtmlSyntaxTree>,
  locatorId: string,
  kind: HtmlLocatorKind,
  element: DefaultTreeAdapterTypes.Element,
  range: { startOffset: number; endOffset: number },
  occurrence: number,
): SourceAnchor {
  return {
    id: `anchor.html:${parsed.document.path}:${locatorId}:${range.startOffset}:${range.endOffset}`,
    languageProviderId: P0_LANGUAGE_IDS.html,
    locatorId,
    filePath: parsed.document.path,
    range,
    queryIntent: `html.${kind}`,
    disambiguation: {
      occurrence,
      ancestorKinds: [element.tagName],
      signature: element.attrs.find(({ name }) => name === "id")?.value,
    },
    sourceRevision: parsed.document.revision,
  };
}

function toDiagnostic(
  filePath: string,
  error: ParserError,
  index: number,
): NormalizedDiagnostic {
  return {
    id: `diagnostic.html:${filePath}:${error.startOffset ?? index}:${error.code}`,
    sourceId: "parser.parse5",
    severity: "error",
    message: `HTML parser reported ${error.code}.`,
    code: error.code,
    filePath,
    ...(error.startOffset !== undefined && error.endOffset !== undefined
      ? {
          range: {
            startOffset: error.startOffset,
            endOffset: error.endOffset,
          },
        }
      : {}),
  };
}

function readOptionalString(
  input: Readonly<Record<string, JsonValue>>,
  key: string,
): string | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`HTML locator input "${key}" must be a non-empty string.`);
  }
  return value;
}

function readRequiredString(
  input: Readonly<Record<string, JsonValue>>,
  key: string,
): string {
  const value = readOptionalString(input, key);
  if (!value) throw new Error(`HTML locator input "${key}" is required.`);
  return value;
}

function readOptionalOccurrence(
  input: Readonly<Record<string, JsonValue>>,
): number | undefined {
  const value = input.occurrence;
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error('HTML locator input "occurrence" must be a non-negative integer.');
  }
  return value;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException("HTML parsing was cancelled.", "AbortError");
}
