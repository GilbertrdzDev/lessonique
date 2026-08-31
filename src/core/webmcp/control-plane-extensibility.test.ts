import { describe, expect, it } from "vitest";

import {
  createP0ProviderPlatform,
  P0_GUIDANCE_EFFECT_IDS,
  P0_INTERACTION_EVENT_TYPE_IDS,
} from "@/providers/p0";

import { getWebMCPToolJsonSchema } from "./schemas";
import { createEarlyWebMCPToolRegistry } from "./mock-handlers";
import { WEBMCP_TOOL_NAMES } from "./tool-names";

const FAKE_TARGET_INPUT_SCHEMA = {
  type: "object",
  properties: {
    targetId: {
      type: "string",
      minLength: 1,
      maxLength: 128,
      pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]*$",
    },
  },
  required: ["targetId"],
  additionalProperties: false,
} as const;

describe("WebMCP control-plane extensibility", () => {
  it("discovers a Fake Provider, Fake Surface, and Fake Target Resolver without changing tool contracts", async () => {
    const registries = createP0ProviderPlatform();
    const contractsBefore = WEBMCP_TOOL_NAMES.map((toolName) => [
      toolName,
      getWebMCPToolJsonSchema(toolName),
    ]);

    registries.languages.register({
      id: "language.fake",
      displayName: "Fake Provider",
      extensions: [".fake"],
      locatorIds: [],
      validatorIds: [],
    });
    registries.surfaces.register({
      id: "surface.fake",
      displayName: "Fake Surface",
      supportedModeIds: ["fake"],
      supportedPlacementIds: ["main"],
      configurationOptions: [],
      actionIds: [],
    });
    registries.targetResolvers.register({
      id: "target.fake",
      displayName: "Fake Target Resolver",
      inputSchema: FAKE_TARGET_INPUT_SCHEMA,
      supportedEffectIds: [P0_GUIDANCE_EFFECT_IDS.focus],
      supportedInteractionEventTypeIds: [
        P0_INTERACTION_EVENT_TYPE_IDS.surfaceActivate,
      ],
    });

    const result = await createEarlyWebMCPToolRegistry(registries).invoke(
      "get_system_capabilities",
      { include: ["languages", "surfaces", "target_resolvers"] },
    );

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({
          languages: expect.arrayContaining([
            expect.objectContaining({ id: "language.fake" }),
          ]),
          surfaces: expect.arrayContaining([
            expect.objectContaining({ id: "surface.fake" }),
          ]),
          targetResolvers: expect.arrayContaining([
            expect.objectContaining({ id: "target.fake" }),
          ]),
        }),
      }),
    );
    expect(
      WEBMCP_TOOL_NAMES.map((toolName) => [
        toolName,
        getWebMCPToolJsonSchema(toolName),
      ]),
    ).toEqual(contractsBefore);
  });
});
