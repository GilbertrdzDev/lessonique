import { describe, expect, it } from "vitest";

import { CapabilityCatalog } from "@/core/platform/capability-catalog";
import { DEFAULT_SYSTEM_LIMITS } from "@/core/platform/contracts";
import { createP0ProviderPlatform } from "@/providers/p0";

import {
  CapabilityValidationError,
  CapabilityValidator,
  GetSystemCapabilitiesService,
} from "./capabilities";

describe("GetSystemCapabilitiesService", () => {
  it("returns registry-derived provider and guidance capabilities without voice or audio", () => {
    const registries = createP0ProviderPlatform();
    const service = new GetSystemCapabilitiesService(
      new CapabilityCatalog(registries),
      new CapabilityValidator(registries),
    );

    const result = service.execute({});

    expect(result.environmentProfiles?.map(({ id }) => id)).toContain("profile.vanilla-web");
    expect(result.surfaces?.find(({ id }) => id === "editor")?.configurationOptions).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "editor.font-size" })]),
    );
    expect(result.targetResolvers?.map(({ id }) => id)).toContain("target.code-range");
    expect(result.assistantStates?.map(({ id }) => id)).toContain("assistant.idle");
    expect(result.assistantPlacements?.map(({ id }) => id)).toContain("placement.near-target");
    expect(result.interactionEventTypes?.map(({ id }) => id)).toContain(
      "interaction.editor-change",
    );
    expect(JSON.stringify(result)).not.toMatch(
      /voice|audio|narration|speech|synthesis|ssml|playback/iu,
    );
  });

  it("filters requested sections and profile-scoped capabilities", () => {
    const registries = createP0ProviderPlatform();
    const service = new GetSystemCapabilitiesService(
      new CapabilityCatalog(registries),
      new CapabilityValidator(registries),
    );

    const result = service.execute({
      profileId: "profile.javascript-console",
      include: ["profiles", "languages", "surfaces", "assistant_states"],
    });

    expect(Object.keys(result)).toEqual([
      "environmentProfiles",
      "languages",
      "surfaces",
      "assistantStates",
      "assistantPlacements",
    ]);
    expect(result.languages?.map(({ id }) => id)).toEqual(["language.javascript"]);
    expect(result.surfaces?.map(({ id }) => id)).not.toContain("preview");
  });

  it("reports supported profiles for an unknown profile", () => {
    const registries = createP0ProviderPlatform();
    const service = new GetSystemCapabilitiesService(
      new CapabilityCatalog(registries),
      new CapabilityValidator(registries),
    );

    expect(() => service.execute({ profileId: "profile.unknown" })).toThrow(
      expect.objectContaining({
        code: "unsupported_capability",
        supportedAlternatives: ["profile.vanilla-web", "profile.javascript-console"],
      }),
    );
  });
});

describe("CapabilityValidator", () => {
  it("validates profile-scoped providers, surfaces, options, and actions", () => {
    const validator = new CapabilityValidator(createP0ProviderPlatform());

    expect(
      validator.requireLanguage("language.javascript", "profile.javascript-console").id,
    ).toBe("language.javascript");
    expect(
      validator.validateSurface(
        {
          id: "editor",
          modeId: "code",
          placementId: "main",
          options: [{ optionId: "editor.font-size", value: 18 }],
        },
        "profile.vanilla-web",
      ).id,
    ).toBe("editor");
    expect(validator.validateAction("runtime.run", {}, "profile.vanilla-web").id).toBe(
      "runtime.run",
    );
  });

  it("rejects unsupported options and action input with structured alternatives", () => {
    const validator = new CapabilityValidator(createP0ProviderPlatform());

    expect(() =>
      validator.validateSurface(
        {
          id: "editor",
          options: [{ optionId: "editor.unknown", value: true }],
        },
        "profile.vanilla-web",
      ),
    ).toThrow(
      expect.objectContaining({
        code: "unsupported_capability",
        supportedAlternatives: ["editor.word-wrap", "editor.minimap", "editor.font-size"],
      }),
    );
    expect(() => validator.validateAction("runtime.run", { command: "rm" })).toThrow(
      expect.objectContaining({ code: "invalid_capability_input" }),
    );
  });

  it("validates targets, effects, assistant presentation, and interaction events", () => {
    const validator = new CapabilityValidator(createP0ProviderPlatform());
    const target = validator.validateTarget({
      resolverId: "target.preview-anchor",
      input: { anchorId: "form.submit" },
    });

    expect(
      validator.validateGuidanceEffect("effect.focus", {}, target.id).id,
    ).toBe("effect.focus");
    expect(validator.requireAssistantState("assistant.pointing").id).toBe(
      "assistant.pointing",
    );
    expect(validator.requireAssistantPlacement("placement.near-target", true).id).toBe(
      "placement.near-target",
    );
    expect(
      validator.requireInteractionEvent("interaction.preview-click", target.id).id,
    ).toBe("interaction.preview-click");
  });

  it("rejects unsafe targets and target-dependent placements without partial alternatives", () => {
    const validator = new CapabilityValidator(createP0ProviderPlatform());

    expect(() =>
      validator.validateTarget({
        resolverId: "target.preview-anchor",
        input: { selector: "#unsafe" },
      }),
    ).toThrow(CapabilityValidationError);
    expect(() =>
      validator.requireAssistantPlacement("placement.near-target", false),
    ).toThrow(
      expect.objectContaining({
        code: "invalid_capability_input",
        category: "assistant_placement",
      }),
    );
  });

  it("enforces the capability-declared callout limit", () => {
    const validator = new CapabilityValidator(createP0ProviderPlatform());

    expect(
      validator.validateGuidanceEffect("effect.callout", {
        text: "x".repeat(DEFAULT_SYSTEM_LIMITS.maxTooltipCharacters),
      }).id,
    ).toBe("effect.callout");
    expect(() =>
      validator.validateGuidanceEffect("effect.callout", {
        text: "x".repeat(DEFAULT_SYSTEM_LIMITS.maxTooltipCharacters + 1),
      }),
    ).toThrow(
      expect.objectContaining({
        code: "invalid_capability_input",
        category: "guidance_effect",
      }),
    );
  });
});
