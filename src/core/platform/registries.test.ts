import { describe, expect, it } from "vitest";

import type { ClosedJsonObjectSchema } from "./json-schema";
import {
  ProviderPlatformRegistries,
  UnsafeTargetInputError,
} from "./registries";
import { MissingRegistryItemError } from "./registry";

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

describe("ProviderPlatformRegistries", () => {
  it("registers and retrieves every generic platform capability", () => {
    const registries = new ProviderPlatformRegistries();

    registries.locators.register({
      id: "fixture.locator",
      displayName: "Fixture locator",
      languageId: "language.fixture",
      inputSchema: EMPTY_INPUT_SCHEMA,
    });
    registries.validators.register({
      id: "fixture.validator",
      displayName: "Fixture validator",
      supportedLanguageIds: ["language.fixture"],
      inputSchema: EMPTY_INPUT_SCHEMA,
    });
    registries.languages.register({
      id: "language.fixture",
      displayName: "Fixture language",
      extensions: [".fixture"],
      locatorIds: ["fixture.locator"],
      validatorIds: ["fixture.validator"],
    });
    registries.runtimes.register({
      id: "runtime.fixture",
      displayName: "Fixture runtime",
      supportedLanguageIds: ["language.fixture"],
      capabilities: {
        preview: false,
        console: true,
        terminal: false,
        run: true,
        stop: false,
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
      id: "console",
      displayName: "Console",
      supportedModeIds: ["output"],
      supportedPlacementIds: ["main"],
      configurationOptions: [
        {
          id: "console.wrap",
          valueType: "boolean",
          defaultValue: true,
        },
      ],
      actionIds: [],
    });
    registries.actions.register({
      id: "runtime.fixture-run",
      ownerType: "runtime",
      ownerId: "runtime.fixture",
      inputSchema: EMPTY_INPUT_SCHEMA,
    });
    registries.environmentProfiles.register({
      id: "profile.fixture",
      displayName: "Fixture profile",
      runtimeProviderId: "runtime.fixture",
      defaultLanguageIds: ["language.fixture"],
      allowedLanguageIds: ["language.fixture"],
      defaultFiles: [],
      defaultSurfaces: [{ id: "console", visible: true }],
      allowedSurfaceIds: ["console"],
      allowedActionIds: ["runtime.fixture-run"],
    });
    registries.targetResolvers.register({
      id: "target.fixture-anchor",
      displayName: "Fixture target",
      inputSchema: ANCHOR_INPUT_SCHEMA,
      supportedEffectIds: ["effect.fixture-focus"],
      supportedInteractionEventTypeIds: ["interaction.fixture-activate"],
    });
    registries.interactionAnchors.register({
      id: "classroom.fixture-anchor",
      displayName: "Fixture anchor",
      surfaceId: "console",
    });
    registries.guidance.effects.register({
      id: "effect.fixture-focus",
      displayName: "Fixture focus",
      inputSchema: EMPTY_INPUT_SCHEMA,
    });
    registries.guidance.assistantStates.register({
      id: "assistant.fixture-idle",
      displayName: "Fixture idle",
    });
    registries.guidance.assistantPlacements.register({
      id: "assistant-placement.fixture-auto",
      displayName: "Fixture automatic placement",
      requiresTarget: false,
    });
    registries.guidance.interactionEventTypes.register({
      id: "interaction.fixture-activate",
      displayName: "Fixture activation",
    });

    expect(registries.languages.require("language.fixture").extensions).toEqual([
      ".fixture",
    ]);
    expect(registries.runtimes.require("runtime.fixture").capabilities.run).toBe(
      true,
    );
    expect(registries.environmentProfiles.list()).toHaveLength(1);
    expect(registries.surfaces.list()).toHaveLength(1);
    expect(registries.actions.list()).toHaveLength(1);
    expect(registries.locators.list()).toHaveLength(1);
    expect(registries.validators.list()).toHaveLength(1);
    expect(registries.targetResolvers.list()).toHaveLength(1);
    expect(registries.interactionAnchors.list()).toHaveLength(1);
    expect(registries.guidance.effects.list()).toHaveLength(1);
    expect(registries.guidance.assistantStates.list()).toHaveLength(1);
    expect(registries.guidance.assistantPlacements.list()).toHaveLength(1);
    expect(registries.guidance.interactionEventTypes.list()).toHaveLength(1);
  });

  it("validates semantic target references before an adapter can receive them", () => {
    const registries = new ProviderPlatformRegistries();
    registries.targetResolvers.register({
      id: "target.ui-anchor",
      displayName: "UI anchor",
      inputSchema: ANCHOR_INPUT_SCHEMA,
      supportedEffectIds: [],
      supportedInteractionEventTypeIds: [],
    });

    expect(
      registries.targetResolvers.validateReference({
        resolverId: "target.ui-anchor",
        input: { anchorId: "classroom.runtime.run" },
      }).id,
    ).toBe("target.ui-anchor");

    expect(() =>
      registries.targetResolvers.validateReference({
        resolverId: "target.ui-anchor",
        input: { selector: "#run" },
      }),
    ).toThrow(UnsafeTargetInputError);
    expect(() =>
      registries.targetResolvers.validateReference({
        resolverId: "target.ui-anchor",
        input: { xpath: "//button" },
      }),
    ).toThrow(UnsafeTargetInputError);
    expect(() =>
      registries.targetResolvers.validateReference({
        resolverId: "target.ui-anchor",
        input: { domPath: ["body", "button"] },
      }),
    ).toThrow(UnsafeTargetInputError);
    expect(() =>
      registries.targetResolvers.validateReference({
        resolverId: "target.ui-anchor",
        input: { coordinates: { x: 10, y: 20 } },
      }),
    ).toThrow(UnsafeTargetInputError);
    expect(() =>
      registries.targetResolvers.validateReference({
        resolverId: "target.missing",
        input: {},
      }),
    ).toThrow(MissingRegistryItemError);
  });

  it("rejects target resolver definitions that advertise unsafe locators", () => {
    const registries = new ProviderPlatformRegistries();

    expect(() =>
      registries.targetResolvers.register({
        id: "target.unsafe",
        displayName: "Unsafe target",
        inputSchema: {
          type: "object",
          properties: { cssSelector: { type: "string" } },
          additionalProperties: false,
        },
        supportedEffectIds: [],
        supportedInteractionEventTypeIds: [],
      }),
    ).toThrow(UnsafeTargetInputError);
  });
});
