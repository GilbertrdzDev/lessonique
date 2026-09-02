import postcss, {
  CssSyntaxError,
  type AtRule,
  type ChildNode,
  type Declaration,
  type Root,
} from "postcss";

import type {
  LanguageIntelligenceProvider,
  NormalizedDiagnostic,
  ParsedSourceDocument,
  SourceAnchor,
  SourceLocator,
  SourceLocatorResult,
  SourceOffsetRange,
} from "@/core/code-intelligence";
import type { JsonValue } from "@/core/platform/json-schema";

import { P0_LANGUAGE_IDS } from "../provider-platform";
import { P0_SOURCE_LOCATOR_IDS } from "./ids";

type CssLocatorKind = "rule" | "property" | "media-query";
type SelectorKind = "class" | "id" | "element";

export class CssIntelligenceProvider implements LanguageIntelligenceProvider<Root> {
  readonly languageId = P0_LANGUAGE_IDS.css;
  readonly locators = [
    new CssSourceLocator(P0_SOURCE_LOCATOR_IDS.cssRule, "rule"),
    new CssSourceLocator(P0_SOURCE_LOCATOR_IDS.cssProperty, "property"),
    new CssSourceLocator(P0_SOURCE_LOCATOR_IDS.cssMediaQuery, "media-query"),
  ];
  readonly locatorIds = this.locators.map(({ id }) => id);
  readonly validatorIds: readonly string[] = [];

  parse(
    document: Parameters<LanguageIntelligenceProvider<Root>["parse"]>[0],
    signal: AbortSignal,
  ): ParsedSourceDocument<Root> {
    throwIfAborted(signal);
    try {
      const tree = postcss.parse(document.content, { from: document.path });
      throwIfAborted(signal);
      return {
        document: structuredClone(document),
        tree,
        valid: true,
        diagnostics: [],
      };
    } catch (error) {
      if (!(error instanceof CssSyntaxError)) throw error;
      return {
        document: structuredClone(document),
        valid: false,
        diagnostics: [toDiagnostic(document.content, document.path, error)],
      };
    }
  }
}

class CssSourceLocator implements SourceLocator<Root> {
  readonly id: string;
  readonly languageId = P0_LANGUAGE_IDS.css;
  readonly #kind: CssLocatorKind;

  constructor(id: string, kind: CssLocatorKind) {
    this.id = id;
    this.#kind = kind;
  }

  locate(
    parsed: ParsedSourceDocument<Root>,
    input: Readonly<Record<string, JsonValue>>,
    signal: AbortSignal,
  ): SourceLocatorResult {
    if (!parsed.tree) {
      return { documentRevision: parsed.document.revision, anchors: [] };
    }
    const query = readQuery(this.#kind, input);
    const matches: ChildNode[] = [];
    if (this.#kind === "rule") {
      parsed.tree.walkRules((rule) => {
        throwIfAborted(signal);
        if (matchesStructuredSelector(rule.selector, query)) matches.push(rule);
      });
    } else if (this.#kind === "property") {
      parsed.tree.walkDecls((declaration) => {
        throwIfAborted(signal);
        if (
          declaration.prop.toLowerCase() === query.propertyName &&
          matchesDeclarationParent(declaration, query)
        ) {
          matches.push(declaration);
        }
      });
    } else {
      parsed.tree.walkAtRules("media", (atRule) => {
        throwIfAborted(signal);
        if (matchesMediaQuery(atRule, query)) matches.push(atRule);
      });
    }
    const selected =
      query.occurrence === undefined
        ? matches
        : matches[query.occurrence]
          ? [matches[query.occurrence]]
          : [];
    return {
      documentRevision: parsed.document.revision,
      anchors: selected.flatMap((node, index) => {
        const range = sourceRange(node);
        return range
          ? [
              createAnchor(
                parsed,
                this.id,
                this.#kind,
                query,
                range,
                query.occurrence ?? index,
              ),
            ]
          : [];
      }),
    };
  }
}

type CssQuery = {
  selectorKind?: SelectorKind;
  selectorName?: string;
  propertyName?: string;
  feature?: string;
  value?: string;
  occurrence?: number;
};

function readQuery(
  kind: CssLocatorKind,
  input: Readonly<Record<string, JsonValue>>,
): CssQuery {
  const allowed = new Set([
    "occurrence",
    ...(kind !== "media-query" ? ["selectorKind", "selectorName"] : []),
    ...(kind === "property" ? ["propertyName"] : []),
    ...(kind === "media-query" ? ["feature", "value"] : []),
  ]);
  Object.keys(input).forEach((key) => {
    if (!allowed.has(key)) {
      throw new Error(`CSS locator input "${key}" is not supported.`);
    }
  });
  const query: CssQuery = {
    ...(readOccurrence(input) !== undefined
      ? { occurrence: readOccurrence(input) }
      : {}),
  };
  if (kind !== "media-query") {
    query.selectorKind = readSelectorKind(input);
    query.selectorName = readIdentifier(input, "selectorName");
  }
  if (kind === "property") {
    query.propertyName = readIdentifier(input, "propertyName").toLowerCase();
  }
  if (kind === "media-query") {
    query.feature = readIdentifier(input, "feature").toLowerCase();
    const value = input.value;
    if (value !== undefined) {
      if (typeof value !== "string" || value.trim() === "") {
        throw new Error('CSS locator input "value" must be a non-empty string.');
      }
      query.value = value.trim().toLowerCase();
    }
  }
  return query;
}

function matchesStructuredSelector(selector: string, query: CssQuery): boolean {
  const name = escapeRegExp(query.selectorName ?? "");
  const token =
    query.selectorKind === "class"
      ? `\\.${name}(?![A-Za-z0-9_-])`
      : query.selectorKind === "id"
        ? `#${name}(?![A-Za-z0-9_-])`
        : `(?:^|[\\s>+~,(])${name}(?=[\\s>+~.#:[,]|$)`;
  return new RegExp(token, "iu").test(selector);
}

function matchesDeclarationParent(
  declaration: Declaration,
  query: CssQuery,
): boolean {
  const parent = declaration.parent;
  return parent?.type === "rule" && matchesStructuredSelector(parent.selector, query);
}

function matchesMediaQuery(atRule: AtRule, query: CssQuery): boolean {
  const normalized = atRule.params.toLowerCase();
  const feature = query.feature ?? "";
  if (!new RegExp(`\\(\\s*${escapeRegExp(feature)}\\s*:`, "u").test(normalized)) {
    return false;
  }
  return query.value ? normalized.includes(query.value) : true;
}

function sourceRange(node: ChildNode): SourceOffsetRange | undefined {
  const startOffset = node.source?.start?.offset;
  const endOffset = node.source?.end?.offset;
  return startOffset !== undefined && endOffset !== undefined
    ? { startOffset, endOffset }
    : undefined;
}

function createAnchor(
  parsed: ParsedSourceDocument<Root>,
  locatorId: string,
  kind: CssLocatorKind,
  query: CssQuery,
  range: SourceOffsetRange,
  occurrence: number,
): SourceAnchor {
  const signature =
    kind === "media-query"
      ? `feature:${query.feature}`
      : kind === "property"
        ? `${query.selectorKind}:${query.selectorName}/property:${query.propertyName}`
        : `${query.selectorKind}:${query.selectorName}`;
  return {
    id: `anchor.css:${parsed.document.path}:${locatorId}:${range.startOffset}:${range.endOffset}`,
    languageProviderId: P0_LANGUAGE_IDS.css,
    locatorId,
    filePath: parsed.document.path,
    range,
    queryIntent: `css.${kind}`,
    disambiguation: { occurrence, signature },
    sourceRevision: parsed.document.revision,
  };
}

function toDiagnostic(
  source: string,
  filePath: string,
  error: CssSyntaxError,
): NormalizedDiagnostic {
  const startLine = error.line ?? 1;
  const startColumn = error.column ?? 1;
  const startOffset = positionToOffset(source, startLine, startColumn);
  const endOffset = positionToOffset(
    source,
    error.endLine ?? startLine,
    error.endColumn ?? startColumn + 1,
  );
  return {
    id: `diagnostic.css:${filePath}:${startOffset}`,
    sourceId: "parser.postcss",
    severity: "error",
    message: error.reason,
    code: "css-syntax-error",
    filePath,
    range: { startOffset, endOffset: Math.max(startOffset, endOffset) },
  };
}

function positionToOffset(source: string, line: number, column: number): number {
  const lines = source.split("\n");
  return (
    lines.slice(0, Math.max(0, line - 1)).reduce((total, value) => total + value.length + 1, 0) +
    Math.max(0, column - 1)
  );
}

function readSelectorKind(
  input: Readonly<Record<string, JsonValue>>,
): SelectorKind {
  const value = input.selectorKind;
  if (value !== "class" && value !== "id" && value !== "element") {
    throw new Error(
      'CSS locator input "selectorKind" must be "class", "id", or "element".',
    );
  }
  return value;
}

function readIdentifier(
  input: Readonly<Record<string, JsonValue>>,
  key: string,
): string {
  const value = input[key];
  if (typeof value !== "string" || !/^[A-Za-z_][A-Za-z0-9_-]*$/u.test(value)) {
    throw new Error(`CSS locator input "${key}" must be a simple identifier.`);
  }
  return value;
}

function readOccurrence(
  input: Readonly<Record<string, JsonValue>>,
): number | undefined {
  const value = input.occurrence;
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error('CSS locator input "occurrence" must be a non-negative integer.');
  }
  return value;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException("CSS parsing was cancelled.", "AbortError");
}
