import {
  CodeIntelligenceService,
  DiagnosticSnapshotStore,
  LanguageIntelligenceProviderRegistry,
  ParsingScheduler,
  PreviewTargetQueryRegistry,
  SemanticTargetMapperRegistry,
} from "@/core/code-intelligence";
import type { ProviderPlatformRegistries } from "@/core/platform/registries";

import { P0_LANGUAGE_IDS } from "../provider-platform";
import { CssIntelligenceProvider } from "./css-provider";
import { HtmlIntelligenceProvider } from "./html-provider";
import { JavascriptIntelligenceProvider } from "./javascript-provider";
import {
  P0EditorTargetMapper,
  P0HtmlPreviewTargetMapper,
} from "./target-mappers";

export interface P0CodeIntelligenceRuntime {
  service: CodeIntelligenceService;
  providers: LanguageIntelligenceProviderRegistry;
  mappers: SemanticTargetMapperRegistry;
  previewQueries: PreviewTargetQueryRegistry;
  diagnostics: DiagnosticSnapshotStore;
  dispose(): void;
}

export function createP0CodeIntelligenceRuntime(
  platform: ProviderPlatformRegistries,
  options: { debounceMs?: number } = {},
): P0CodeIntelligenceRuntime {
  const providers = new LanguageIntelligenceProviderRegistry();
  providers.register(new HtmlIntelligenceProvider());
  providers.register(new CssIntelligenceProvider());
  providers.register(new JavascriptIntelligenceProvider());

  const previewQueries = new PreviewTargetQueryRegistry();
  const diagnostics = new DiagnosticSnapshotStore();
  const mappers = new SemanticTargetMapperRegistry();
  [
    P0_LANGUAGE_IDS.html,
    P0_LANGUAGE_IDS.css,
    P0_LANGUAGE_IDS.javascript,
  ].forEach((languageId) => mappers.register(new P0EditorTargetMapper(languageId)));
  mappers.register(new P0HtmlPreviewTargetMapper(previewQueries));

  const scheduler = new ParsingScheduler({ debounceMs: options.debounceMs });
  const service = new CodeIntelligenceService({
    platform,
    providers,
    mappers,
    scheduler,
    diagnostics,
  });
  return {
    service,
    providers,
    mappers,
    previewQueries,
    diagnostics,
    dispose() {
      scheduler.cancelAll();
      previewQueries.clear();
      diagnostics.clear();
    },
  };
}
