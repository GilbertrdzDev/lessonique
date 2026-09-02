import { describe, expect, it } from "vitest";

import { ProviderPlatformRegistries } from "@/core/platform/registries";
import { WorkspaceStore } from "@/core/workspace";

import { CodeIntelligenceService } from "./service";
import {
  ExecutableValidatorRegistry,
  ValidationEngine,
} from "./validation-engine";
import {
  LanguageIntelligenceProviderRegistry,
  SemanticTargetMapperRegistry,
} from "./registries";
import { ParsingScheduler } from "./parsing-scheduler";
import {
  FakeExecutableValidator,
  FakeLanguageIntelligenceProvider,
  FakeSemanticTargetMapper,
} from "./testing/fakes";

describe("code intelligence extensibility", () => {
  it("adds a fake language, target mapper, and validator without core changes", async () => {
    const platform = createFakePlatform();
    const providers = new LanguageIntelligenceProviderRegistry();
    providers.register(new FakeLanguageIntelligenceProvider());
    const mappers = new SemanticTargetMapperRegistry();
    mappers.register(new FakeSemanticTargetMapper());
    const service = new CodeIntelligenceService({
      platform,
      providers,
      mappers,
      scheduler: new ParsingScheduler({ debounceMs: 0 }),
    });

    const query = await service.query({
      document: {
        path: "lesson.fake",
        languageId: "language.fake",
        content: "start finish",
        revision: 1,
      },
      locator: {
        locatorId: "locator.fake-symbol",
        input: { name: "finish" },
      },
    });
    expect(query.targets).toEqual([
      expect.objectContaining({
        target: {
          resolverId: "target.fake-code",
          input: { anchorId: expect.stringContaining("anchor.fake") },
        },
      }),
    ]);

    const executable = new ExecutableValidatorRegistry();
    executable.register(new FakeExecutableValidator());
    const validation = new ValidationEngine(executable, {
      platform,
      changes: new WorkspaceStore(),
    });
    await expect(
      validation.evaluate({
        id: "condition.fake",
        validatorId: "validator.fake-symbol-exists",
        input: { present: true },
      }),
    ).resolves.toEqual(expect.objectContaining({ status: "passed" }));
  });

  it("keeps interactive queries independent from background analysis for the same file", async () => {
    const platform = createFakePlatform();
    const providers = new LanguageIntelligenceProviderRegistry();
    providers.register(new FakeLanguageIntelligenceProvider());
    const mappers = new SemanticTargetMapperRegistry();
    mappers.register(new FakeSemanticTargetMapper());
    const service = new CodeIntelligenceService({
      platform,
      providers,
      mappers,
      scheduler: new ParsingScheduler({ debounceMs: 0 }),
      analysisScheduler: new ParsingScheduler({ debounceMs: 0 }),
    });
    const document = {
      path: "lesson.fake",
      languageId: "language.fake",
      content: "start finish",
      revision: 1,
    };

    const [analysis, query] = await Promise.all([
      service.analyze(document),
      service.query({
        document,
        locator: {
          locatorId: "locator.fake-symbol",
          input: { name: "finish" },
        },
      }),
    ]);

    expect(analysis.valid).toBe(true);
    expect(query.anchors).toHaveLength(1);
  });

  it("rejects mappings that change anchor, representation, or resolver identity", () => {
    const registry = new SemanticTargetMapperRegistry();
    const anchor = {
      id: "anchor.fake:lesson:0",
      languageProviderId: "language.fake",
      locatorId: "locator.fake-symbol",
      filePath: "lesson.fake",
      range: { startOffset: 0, endOffset: 5 },
      queryIntent: "fake.symbol",
      sourceRevision: 1,
    };
    registry.register({
      id: "mapper.invalid-anchor",
      languageId: "language.fake",
      resolverId: "target.fake-code",
      representation: "editor",
      map: () => [
        {
          anchorId: "anchor.other",
          representation: "editor",
          target: {
            resolverId: "target.fake-code",
            input: { anchorId: "anchor.other" },
          },
        },
      ],
    });

    expect(() =>
      registry.map(anchor, {
        document: {
          path: "lesson.fake",
          languageId: "language.fake",
          content: "start",
          revision: 1,
        },
        query: { locatorId: "locator.fake-symbol", input: { name: "start" } },
      }),
    ).toThrow("another anchor");

    const representationRegistry = new SemanticTargetMapperRegistry();
    representationRegistry.register({
      id: "mapper.invalid-representation",
      languageId: "language.fake",
      resolverId: "target.fake-code",
      representation: "editor",
      map: () => [
        {
          anchorId: anchor.id,
          representation: "preview",
          target: {
            resolverId: "target.fake-code",
            input: { anchorId: anchor.id },
          },
        },
      ],
    });
    expect(() =>
      representationRegistry.map(anchor, {
        document: {
          path: "lesson.fake",
          languageId: "language.fake",
          content: "start",
          revision: 1,
        },
        query: { locatorId: "locator.fake-symbol", input: { name: "start" } },
      }),
    ).toThrow("undeclared representation");

    const resolverRegistry = new SemanticTargetMapperRegistry();
    resolverRegistry.register({
      id: "mapper.invalid-resolver",
      languageId: "language.fake",
      resolverId: "target.fake-code",
      representation: "editor",
      map: () => [
        {
          anchorId: anchor.id,
          representation: "editor",
          target: {
            resolverId: "target.other-code",
            input: { anchorId: anchor.id },
          },
        },
      ],
    });
    expect(() =>
      resolverRegistry.map(anchor, {
        document: {
          path: "lesson.fake",
          languageId: "language.fake",
          content: "start",
          revision: 1,
        },
        query: { locatorId: "locator.fake-symbol", input: { name: "start" } },
      }),
    ).toThrow("undeclared resolver");
  });
});

function createFakePlatform(): ProviderPlatformRegistries {
  const platform = new ProviderPlatformRegistries();
  platform.languages.register({
    id: "language.fake",
    displayName: "Fake",
    extensions: [".fake"],
    locatorIds: ["locator.fake-symbol"],
    validatorIds: ["validator.fake-symbol-exists"],
  });
  platform.locators.register({
    id: "locator.fake-symbol",
    displayName: "Fake symbol",
    languageId: "language.fake",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string", minLength: 1 } },
      required: ["name"],
      additionalProperties: false,
    },
  });
  platform.validators.register({
    id: "validator.fake-symbol-exists",
    displayName: "Fake symbol exists",
    supportedLanguageIds: ["language.fake"],
    inputSchema: {
      type: "object",
      properties: { present: { type: "boolean" } },
      required: ["present"],
      additionalProperties: false,
    },
  });
  platform.targetResolvers.register({
    id: "target.fake-code",
    displayName: "Fake code",
    inputSchema: {
      type: "object",
      properties: { anchorId: { type: "string", minLength: 1 } },
      required: ["anchorId"],
      additionalProperties: false,
    },
    supportedEffectIds: [],
    supportedInteractionEventTypeIds: [],
  });
  return platform;
}
