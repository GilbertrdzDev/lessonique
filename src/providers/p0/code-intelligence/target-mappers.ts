import type {
  PreviewTargetQuery,
  SemanticTargetMapper,
  SemanticTargetMapping,
  SemanticTargetMappingContext,
  SourceAnchor,
} from "@/core/code-intelligence";
import {
  offsetRangeToLineColumnRange,
  PreviewTargetQueryRegistry,
} from "@/core/code-intelligence";

import {
  P0_LANGUAGE_IDS,
  P0_TARGET_RESOLVER_IDS,
} from "../provider-platform";
import { P0_SOURCE_LOCATOR_IDS } from "./ids";

export class P0EditorTargetMapper implements SemanticTargetMapper {
  readonly id: string;
  readonly resolverId = P0_TARGET_RESOLVER_IDS.codeRange;
  readonly representation = "editor" as const;
  readonly languageId: string;

  constructor(languageId: string) {
    this.languageId = languageId;
    this.id = `mapper.${languageId.slice("language.".length)}-editor`;
  }

  map(
    anchor: SourceAnchor,
    context: SemanticTargetMappingContext,
  ): readonly SemanticTargetMapping[] {
    if (
      anchor.languageProviderId !== this.languageId ||
      context.document.path !== anchor.filePath ||
      context.document.revision !== anchor.sourceRevision
    ) {
      return [];
    }
    const range = offsetRangeToLineColumnRange(context.document, anchor.range);
    return [
      {
        anchorId: anchor.id,
        representation: this.representation,
        target: {
          resolverId: this.resolverId,
          input: { filePath: anchor.filePath, ...range },
        },
      },
    ];
  }
}

export class P0HtmlPreviewTargetMapper implements SemanticTargetMapper {
  readonly id = "mapper.html-preview";
  readonly resolverId = P0_TARGET_RESOLVER_IDS.previewAnchor;
  readonly representation = "preview" as const;
  readonly languageId = P0_LANGUAGE_IDS.html;
  readonly #queries: PreviewTargetQueryRegistry;

  constructor(queries: PreviewTargetQueryRegistry) {
    this.#queries = queries;
  }

  map(
    anchor: SourceAnchor,
    context: SemanticTargetMappingContext,
  ): readonly SemanticTargetMapping[] {
    if (
      anchor.languageProviderId !== this.languageId ||
      context.document.path !== anchor.filePath ||
      context.document.revision !== anchor.sourceRevision
    ) {
      return [];
    }
    const query = createSafeHtmlPreviewQuery(anchor, context);
    if (!query) return [];
    const queryId = createPreviewQueryId(anchor);
    this.#queries.register({ id: queryId, query });
    return [
      {
        anchorId: anchor.id,
        representation: this.representation,
        target: {
          resolverId: this.resolverId,
          input: { anchorId: queryId },
        },
      },
    ];
  }
}

export function createSafeHtmlPreviewQuery(
  anchor: SourceAnchor,
  context: SemanticTargetMappingContext,
): PreviewTargetQuery | undefined {
  const input = context.query.input;
  const tagName = readOptionalString(input.tagName)?.toLowerCase();
  const id = readOptionalString(input.id);
  const occurrence = anchor.disambiguation?.occurrence ?? 0;
  if (context.query.locatorId === P0_SOURCE_LOCATOR_IDS.htmlElement) {
    return {
      kind: "html-element",
      ...(tagName ? { tagName } : {}),
      ...(id ? { id } : {}),
      occurrence,
    };
  }
  if (context.query.locatorId === P0_SOURCE_LOCATOR_IDS.htmlAttribute) {
    const attributeName = readOptionalString(input.attributeName)?.toLowerCase();
    return attributeName
      ? {
          kind: "html-element",
          ...(tagName ? { tagName } : {}),
          ...(id ? { id } : {}),
          attributeName,
          occurrence,
        }
      : undefined;
  }
  if (context.query.locatorId === P0_SOURCE_LOCATOR_IDS.htmlClass) {
    const className = readOptionalString(input.className);
    return className
      ? {
          kind: "html-element",
          ...(tagName ? { tagName } : {}),
          ...(id ? { id } : {}),
          className,
          occurrence,
        }
      : undefined;
  }
  return undefined;
}

function createPreviewQueryId(anchor: SourceAnchor): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < anchor.id.length; index += 1) {
    hash ^= anchor.id.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `source.${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
