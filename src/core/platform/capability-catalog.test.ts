import { describe, expect, it } from "vitest";

import {
  CapabilityCatalog,
  CapabilityCatalogConsistencyError,
} from "./capability-catalog";
import type { ClosedJsonObjectSchema } from "./json-schema";
import { ProviderPlatformRegistries } from "./registries";

const EMPTY_INPUT_SCHEMA = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const satisfies ClosedJsonObjectSchema;

const ANCHOR_INPUT_SCHEMA = {
  type: "object",
  properties: {
    anchorId: { type: "string", minLength: 1 },
  },
  required: ["anchorId"],
  additionalProperties: false,
} as const satisfies ClosedJsonObjectSchema;

describe("CapabilityCatalog", () => {
  it("derives provider, surface, action, target, and guidance metadata from registries", () => {
    const registries = createFixtureRegistries();
    const capabilities = new CapabilityCatalog(registries).getCapabilities();

    expect(capabilities.environmentProfiles).toEqual([
      expect.objectContaining({
        id: "profile.fixture",
        runtimeProviderId: "runtime.fixture",
        languageIds: ["language.fixture"],
        surfaceIds: ["editor"],
      }),
    ]);
    expect(capabilities.languages).toEqual([
      expect.objectContaining({
        id: "language.fixture",
        locators: ["fixture.element"],
        validators: ["fixture.exists"],
      }),
    ]);
    expect(capabilities.runtimes).toEqual([
      expect.objectContaining({
        id: "runtime.fixture",
        actions: ["runtime.fixture-run"],
      }),
    ]);
    expect(capabilities.surfaces).toEqual([
      expect.objectContaining({
        id: "editor",
        modes: ["code"],
        placements: ["main"],
        configurationOptions: [
          expect.objectContaining({
            id: "editor.font-size",
            minimum: 12,
            maximum: 24,
          }),
        ],
        actions: ["surface.editor-focus"],
      }),
    ]);
    expect(capabilities.actions.map(({ id }) => id)).toEqual([
      "runtime.fixture-run",
      "surface.editor-focus",
    ]);
    expect(capabilities.targetResolvers).toEqual([
      expect.objectContaining({
        id: "target.ui-anchor",
        effects: ["effect.focus"],
        interactionEventTypes: ["interaction.activate"],
      }),
    ]);
    expect(capabilities.sceneEffects).toEqual([
      expect.objectContaining({ id: "effect.focus" }),
    ]);
    expect(capabilities.assistantStates).toEqual([
      { id: "assistant.idle", displayName: "Idle" },
    ]);
    expect(capabilities.assistantPlacements).toEqual([
      {
        id: "assistant-placement.auto",
        displayName: "Automatic",
        requiresTarget: false,
      },
    ]);
    expect(capabilities.interactionEventTypes).toEqual([
      { id: "interaction.activate", displayName: "Activate" },
    ]);
    expect(capabilities.limits).toEqual(
      expect.objectContaining({
        maxFiles: 8,
        maxLessonSteps: 15,
        maxSceneBeats: 15,
        maxVisualGuideBodyCharacters: 500,
      }),
    );

    const serializedCapabilities = JSON.stringify(capabilities);
    expect(serializedCapabilities).not.toMatch(
      /voice|audio|narration|speech|synthesis|ssml|playback/iu,
    );
  });

  it("reflects newly registered capabilities without changing catalog code", () => {
    const registries = createFixtureRegistries();
    const catalog = new CapabilityCatalog(registries);

    registries.languages.register({
      id: "language.fake",
      displayName: "Fake language",
      extensions: [".fake"],
      locatorIds: [],
      validatorIds: [],
    });
    registries.surfaces.register({
      id: "fake-surface",
      displayName: "Fake surface",
      supportedModeIds: ["default"],
      supportedPlacementIds: ["main"],
      configurationOptions: [],
      actionIds: [],
    });
    registries.targetResolvers.register({
      id: "target.fake-anchor",
      displayName: "Fake target",
      inputSchema: ANCHOR_INPUT_SCHEMA,
      supportedEffectIds: ["effect.focus"],
      supportedInteractionEventTypeIds: ["interaction.activate"],
    });
    registries.interactionAnchors.register({
      id: "classroom.fake-anchor",
      displayName: "Fake anchor",
      surfaceId: "fake-surface",
    });

    const capabilities = catalog.getCapabilities();

    expect(capabilities.languages.map(({ id }) => id)).toContain(
      "language.fake",
    );
    expect(capabilities.surfaces.map(({ id }) => id)).toContain("fake-surface");
    expect(capabilities.targetResolvers.map(({ id }) => id)).toContain(
      "target.fake-anchor",
    );
  });

  it("filters profile-scoped providers and merges profile limits", () => {
    const registries = createFixtureRegistries();
    registries.languages.register({
      id: "language.unused",
      displayName: "Unused language",
      extensions: [".unused"],
      locatorIds: [],
      validatorIds: [],
    });
    registries.environmentProfiles.unregister("profile.fixture");
    registries.environmentProfiles.register({
      id: "profile.fixture",
      displayName: "Fixture profile",
      runtimeProviderId: "runtime.fixture",
      defaultLanguageIds: ["language.fixture"],
      allowedLanguageIds: ["language.fixture"],
      defaultFiles: [],
      defaultSurfaces: [{ id: "editor", visible: true }],
      allowedSurfaceIds: ["editor"],
      allowedActionIds: ["runtime.fixture-run", "surface.editor-focus"],
      limits: { maxFiles: 4 },
    });

    const capabilities = new CapabilityCatalog(registries).getCapabilities({
      profileId: "profile.fixture",
    });

    expect(capabilities.environmentProfiles).toHaveLength(1);
    expect(capabilities.languages.map(({ id }) => id)).toEqual([
      "language.fixture",
    ]);
    expect(capabilities.runtimes.map(({ id }) => id)).toEqual([
      "runtime.fixture",
    ]);
    expect(capabilities.surfaces.map(({ id }) => id)).toEqual(["editor"]);
    expect(capabilities.locators.map(({ id }) => id)).toEqual([
      "fixture.element",
    ]);
    expect(capabilities.validators.map(({ id }) => id)).toEqual([
      "fixture.exists",
    ]);
    expect(capabilities.limits.maxFiles).toBe(4);
    expect(capabilities.limits.maxSceneBeats).toBe(15);
  });

  it("rejects inconsistent registry references before publishing capabilities", () => {
    const registries = new ProviderPlatformRegistries();
    registries.languages.register({
      id: "language.broken",
      displayName: "Broken language",
      extensions: [".broken"],
      locatorIds: ["broken.missing-locator"],
      validatorIds: [],
    });

    expect(() => new CapabilityCatalog(registries).getCapabilities()).toThrow(
      CapabilityCatalogConsistencyError,
    );
  });
});

function createFixtureRegistries(): ProviderPlatformRegistries {
  const registries = new ProviderPlatformRegistries();

  registries.locators.register({
    id: "fixture.element",
    displayName: "Fixture element",
    languageId: "language.fixture",
    inputSchema: ANCHOR_INPUT_SCHEMA,
  });
  registries.validators.register({
    id: "fixture.exists",
    displayName: "Fixture exists",
    supportedLanguageIds: ["language.fixture"],
    inputSchema: ANCHOR_INPUT_SCHEMA,
  });
  registries.languages.register({
    id: "language.fixture",
    displayName: "Fixture language",
    extensions: [".fixture"],
    monacoLanguageId: "plaintext",
    locatorIds: ["fixture.element"],
    validatorIds: ["fixture.exists"],
  });
  registries.actions.register({
    id: "runtime.fixture-run",
    ownerType: "runtime",
    ownerId: "runtime.fixture",
    inputSchema: EMPTY_INPUT_SCHEMA,
  });
  registries.actions.register({
    id: "surface.editor-focus",
    ownerType: "surface",
    ownerId: "editor",
    inputSchema: EMPTY_INPUT_SCHEMA,
  });
  registries.runtimes.register({
    id: "runtime.fixture",
    displayName: "Fixture runtime",
    supportedLanguageIds: ["language.fixture"],
    capabilities: {
      preview: true,
      console: true,
      terminal: false,
      run: true,
      stop: true,
      restart: true,
      test: false,
      lint: false,
      format: false,
      packages: false,
      network: false,
    },
    actionIds: ["runtime.fixture-run"],
  });
  registries.surfaces.register({
    id: "editor",
    displayName: "Editor",
    supportedModeIds: ["code"],
    supportedPlacementIds: ["main"],
    configurationOptions: [
      {
        id: "editor.font-size",
        valueType: "number",
        defaultValue: 14,
        minimum: 12,
        maximum: 24,
      },
    ],
    actionIds: ["surface.editor-focus"],
  });
  registries.environmentProfiles.register({
    id: "profile.fixture",
    displayName: "Fixture profile",
    runtimeProviderId: "runtime.fixture",
    defaultLanguageIds: ["language.fixture"],
    allowedLanguageIds: ["language.fixture"],
    defaultFiles: [],
    defaultSurfaces: [{ id: "editor", visible: true }],
    allowedSurfaceIds: ["editor"],
    allowedActionIds: ["runtime.fixture-run", "surface.editor-focus"],
  });
  registries.guidance.effects.register({
    id: "effect.focus",
    displayName: "Focus",
    inputSchema: EMPTY_INPUT_SCHEMA,
  });
  registries.guidance.assistantStates.register({
    id: "assistant.idle",
    displayName: "Idle",
  });
  registries.guidance.assistantPlacements.register({
    id: "assistant-placement.auto",
    displayName: "Automatic",
    requiresTarget: false,
  });
  registries.guidance.interactionEventTypes.register({
    id: "interaction.activate",
    displayName: "Activate",
  });
  registries.targetResolvers.register({
    id: "target.ui-anchor",
    displayName: "UI anchor",
    inputSchema: ANCHOR_INPUT_SCHEMA,
    supportedEffectIds: ["effect.focus"],
    supportedInteractionEventTypeIds: ["interaction.activate"],
  });
  registries.interactionAnchors.register({
    id: "classroom.workspace.editor",
    displayName: "Classroom editor",
    surfaceId: "editor",
  });

  return registries;
}
