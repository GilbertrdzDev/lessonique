import type { ProviderPlatformRegistries } from "@/core/platform/registries";
import { validateClosedJsonObjectInput } from "@/core/platform/json-schema";

import type {
  NormalizedDiagnostic,
  ParsedSourceDocument,
  SemanticTargetMapping,
  SemanticTargetRepresentation,
  SourceAnchor,
  SourceDocument,
  SourceLocatorQuery,
} from "./contracts";
import { ParsingScheduler } from "./parsing-scheduler";
import {
  LanguageIntelligenceProviderRegistry,
  SemanticTargetMapperRegistry,
} from "./registries";
import type { DiagnosticSnapshotStore } from "./diagnostics";

export interface CodeIntelligenceQuery {
  document: SourceDocument;
  locator: SourceLocatorQuery;
  representation?: SemanticTargetRepresentation;
}

export interface CodeIntelligenceQueryResult {
  documentRevision: number;
  anchors: readonly SourceAnchor[];
  targets: readonly SemanticTargetMapping[];
  diagnostics: readonly NormalizedDiagnostic[];
  usedLastValidTree: boolean;
}

export interface CodeIntelligenceServiceOptions {
  platform: ProviderPlatformRegistries;
  providers: LanguageIntelligenceProviderRegistry;
  mappers: SemanticTargetMapperRegistry;
  scheduler?: ParsingScheduler;
  diagnostics?: DiagnosticSnapshotStore;
}

export class CodeIntelligenceService {
  readonly #platform: ProviderPlatformRegistries;
  readonly #providers: LanguageIntelligenceProviderRegistry;
  readonly #mappers: SemanticTargetMapperRegistry;
  readonly #scheduler: ParsingScheduler;
  readonly #diagnostics?: DiagnosticSnapshotStore;

  constructor(options: CodeIntelligenceServiceOptions) {
    this.#platform = options.platform;
    this.#providers = options.providers;
    this.#mappers = options.mappers;
    this.#scheduler = options.scheduler ?? new ParsingScheduler();
    this.#diagnostics = options.diagnostics;
  }

  async query(
    request: CodeIntelligenceQuery,
    signal?: AbortSignal,
  ): Promise<CodeIntelligenceQueryResult> {
    const locatorDefinition = this.#platform.locators.require(
      request.locator.locatorId,
    );
    if (locatorDefinition.languageId !== request.document.languageId) {
      throw new Error(
        `Locator "${locatorDefinition.id}" cannot query language "${request.document.languageId}".`,
      );
    }
    validateClosedJsonObjectInput(
      locatorDefinition.inputSchema,
      request.locator.input,
      `Locator "${locatorDefinition.id}" input`,
    );
    const provider = this.#providers.require(request.document.languageId);
    const locatorLanguage = this.#providers.requireLocatorLanguage(
      request.locator.locatorId,
    );
    if (locatorLanguage !== request.document.languageId) {
      throw new Error(
        `Locator "${request.locator.locatorId}" belongs to "${locatorLanguage}".`,
      );
    }
    const locator = provider.locators.find(
      ({ id }) => id === request.locator.locatorId,
    );
    if (!locator) {
      throw new Error(
        `Provider "${provider.languageId}" does not implement locator "${request.locator.locatorId}".`,
      );
    }
    const parsed = await this.#scheduler.schedule(
      request.document,
      provider,
      signal,
    );
    this.#diagnostics?.replace(
      parsed.current.document,
      parsed.current.diagnostics,
    );
    const locatedDocument = parsed.current.tree
      ? parsed.current
      : parsed.lastValid;
    if (!locatedDocument) {
      return {
        documentRevision: parsed.current.document.revision,
        anchors: [],
        targets: [],
        diagnostics: parsed.current.diagnostics,
        usedLastValidTree: false,
      };
    }
    const located = await locator.locate(
      locatedDocument,
      request.locator.input,
      signal ?? new AbortController().signal,
    );
    const context = {
      document: locatedDocument.document,
      query: request.locator,
    };
    const targets = located.anchors.flatMap((anchor) =>
      this.#mappers.map(anchor, context, request.representation),
    );
    targets.forEach(({ target }) =>
      this.#platform.targetResolvers.validateReference(target),
    );
    return {
      documentRevision: located.documentRevision,
      anchors: located.anchors,
      targets,
      diagnostics: parsed.current.diagnostics,
      usedLastValidTree: locatedDocument === parsed.lastValid,
    };
  }

  async analyze(
    document: SourceDocument,
    signal?: AbortSignal,
  ): Promise<ParsedSourceDocument<unknown>> {
    const provider = this.#providers.require(document.languageId);
    const parsed = await this.#scheduler.schedule(document, provider, signal);
    this.#diagnostics?.replace(
      parsed.current.document,
      parsed.current.diagnostics,
    );
    return parsed.current;
  }

  cancel(path?: string): void {
    if (path) this.#scheduler.cancel(path);
    else this.#scheduler.cancelAll();
  }
}
