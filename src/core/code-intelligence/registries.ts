import type { LanguageId, LocatorId } from "@/core/platform/identifiers";
import { assertNamespacedId } from "@/core/platform/registry";

import type {
  LanguageIntelligenceProvider,
  PreviewTargetQuery,
  PreviewTargetQueryEntry,
  SemanticTargetMapper,
  SemanticTargetMapping,
  SemanticTargetMappingContext,
  SemanticTargetRepresentation,
  SourceAnchor,
} from "./contracts";

export class LanguageIntelligenceProviderRegistry {
  readonly #providers = new Map<
    LanguageId,
    LanguageIntelligenceProvider<unknown>
  >();
  readonly #locators = new Map<LocatorId, LanguageId>();

  register<TTree>(provider: LanguageIntelligenceProvider<TTree>): void {
    assertNamespacedId(provider.languageId, "Language intelligence provider");
    if (this.#providers.has(provider.languageId)) {
      throw new Error(
        `Language intelligence provider "${provider.languageId}" is already registered.`,
      );
    }
    const locatorIds = new Set<string>();
    provider.locators.forEach((locator) => {
      assertNamespacedId(locator.id, "Source locator");
      if (locator.languageId !== provider.languageId) {
        throw new Error(
          `Source locator "${locator.id}" does not belong to "${provider.languageId}".`,
        );
      }
      if (locatorIds.has(locator.id) || this.#locators.has(locator.id)) {
        throw new Error(`Source locator "${locator.id}" is already registered.`);
      }
      locatorIds.add(locator.id);
    });
    if (
      provider.locatorIds.length !== locatorIds.size ||
      provider.locatorIds.some((id) => !locatorIds.has(id))
    ) {
      throw new Error(
        `Language intelligence provider "${provider.languageId}" has inconsistent locator IDs.`,
      );
    }
    this.#providers.set(
      provider.languageId,
      provider as unknown as LanguageIntelligenceProvider<unknown>,
    );
    locatorIds.forEach((id) => this.#locators.set(id, provider.languageId));
  }

  require(languageId: LanguageId): LanguageIntelligenceProvider<unknown> {
    const provider = this.#providers.get(languageId);
    if (!provider) {
      throw new Error(
        `No language intelligence provider is registered for "${languageId}".`,
      );
    }
    return provider;
  }

  requireLocatorLanguage(locatorId: LocatorId): LanguageId {
    const languageId = this.#locators.get(locatorId);
    if (!languageId) {
      throw new Error(`Source locator "${locatorId}" is not registered.`);
    }
    return languageId;
  }

  list(): LanguageIntelligenceProvider<unknown>[] {
    return [...this.#providers.values()];
  }
}

export class SemanticTargetMapperRegistry {
  readonly #mappers = new Map<string, SemanticTargetMapper>();

  register(mapper: SemanticTargetMapper): void {
    assertNamespacedId(mapper.id, "Semantic target mapper");
    assertNamespacedId(mapper.languageId, "Semantic target mapper language");
    assertNamespacedId(mapper.resolverId, "Semantic target resolver");
    if (this.#mappers.has(mapper.id)) {
      throw new Error(`Semantic target mapper "${mapper.id}" is already registered.`);
    }
    this.#mappers.set(mapper.id, mapper);
  }

  map(
    anchor: SourceAnchor,
    context: SemanticTargetMappingContext,
    representation?: SemanticTargetRepresentation,
  ): SemanticTargetMapping[] {
    return this.list()
      .filter(
        (mapper) =>
          mapper.languageId === anchor.languageProviderId &&
          (!representation || mapper.representation === representation),
      )
      .flatMap((mapper) =>
        mapper.map(anchor, context).map((mapping) => {
          if (mapping.anchorId !== anchor.id) {
            throw new Error(
              `Semantic target mapper "${mapper.id}" returned a mapping for another anchor.`,
            );
          }
          if (mapping.representation !== mapper.representation) {
            throw new Error(
              `Semantic target mapper "${mapper.id}" returned an undeclared representation.`,
            );
          }
          if (mapping.target.resolverId !== mapper.resolverId) {
            throw new Error(
              `Semantic target mapper "${mapper.id}" returned an undeclared resolver.`,
            );
          }
          return mapping;
        }),
      );
  }

  list(): SemanticTargetMapper[] {
    return [...this.#mappers.values()];
  }
}

export class PreviewTargetQueryRegistry {
  readonly #queries = new Map<string, PreviewTargetQuery>();

  register(entry: PreviewTargetQueryEntry): void {
    assertNamespacedId(entry.id, "Preview target query");
    assertSafePreviewTargetQuery(entry.query);
    const existing = this.#queries.get(entry.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(entry.query)) {
      throw new Error(`Preview target query "${entry.id}" has a conflicting value.`);
    }
    this.#queries.set(entry.id, structuredClone(entry.query));
  }

  get(id: string): PreviewTargetQuery | undefined {
    const query = this.#queries.get(id);
    return query ? structuredClone(query) : undefined;
  }

  clear(): void {
    this.#queries.clear();
  }
}

export function assertSafePreviewTargetQuery(
  query: PreviewTargetQuery,
): void {
  if (!isRecord(query)) {
    throw new Error("The preview target query must be an object.");
  }
  if (query.kind === "registered-anchor") {
    assertOnlyKeys(query, ["kind", "anchorId"], "Registered preview query");
    assertSemanticId(query.anchorId, "Registered preview anchor ID");
    return;
  }
  if (query.kind !== "html-element") {
    throw new Error("The preview target query kind is not supported.");
  }
  assertOnlyKeys(
    query,
    ["kind", "tagName", "id", "attributeName", "className", "occurrence"],
    "HTML preview query",
  );
  if (!Number.isInteger(query.occurrence) || query.occurrence < 0) {
    throw new Error("Preview target query occurrence must be a non-negative integer.");
  }
  if (!query.tagName && !query.id && !query.attributeName && !query.className) {
    throw new Error("HTML preview queries require a semantic element constraint.");
  }
  if (
    query.tagName !== undefined &&
    (typeof query.tagName !== "string" ||
      !/^[A-Za-z][A-Za-z0-9-]*$/u.test(query.tagName))
  ) {
    throw new Error("HTML preview query tagName is invalid.");
  }
  if (
    query.attributeName !== undefined &&
    (typeof query.attributeName !== "string" ||
      !/^[A-Za-z_:][A-Za-z0-9_.:-]*$/u.test(query.attributeName))
  ) {
    throw new Error("HTML preview query attributeName is invalid.");
  }
  if (query.id !== undefined) {
    assertBoundedString(query.id, "HTML preview query id");
  }
  if (query.className !== undefined) {
    assertBoundedString(query.className, "HTML preview query className");
    if (/\s/u.test(query.className)) {
      throw new Error("HTML preview query className must be one class token.");
    }
  }
}

function assertOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  context: string,
): void {
  const allowed = new Set(allowedKeys);
  const unsupported = Object.keys(value).find((key) => !allowed.has(key));
  if (unsupported) {
    throw new Error(`${context} contains unsupported property "${unsupported}".`);
  }
}

function assertSemanticId(value: unknown, context: string): asserts value is string {
  assertBoundedString(value, context);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value)) {
    throw new Error(`${context} is invalid.`);
  }
}

function assertBoundedString(value: unknown, context: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 128) {
    throw new Error(`${context} must contain between 1 and 128 characters.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
