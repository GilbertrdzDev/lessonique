import { describe, expect, it } from "vitest";

import { createP0ProviderPlatform } from "@/providers/p0";

import { createEarlyWebMCPToolRegistry } from "./mock-handlers";
import { WEBMCP_TOOL_INPUT_SCHEMAS } from "./schemas";
import { DuplicateToolDefinitionError, ToolRegistry } from "./tool-registry";
import { WEBMCP_TOOL_NAMES } from "./tool-names";

describe("ToolRegistry", () => {
  it("registers the complete P0 catalog with a real capability handler and mock integrations", async () => {
    const registry = createEarlyWebMCPToolRegistry(createP0ProviderPlatform());

    expect(registry.list().map(({ name }) => name)).toEqual(WEBMCP_TOOL_NAMES);
    await expect(registry.invoke("get_system_capabilities", {})).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        status: "completed",
        data: expect.objectContaining({
          environmentProfiles: expect.arrayContaining([
            expect.objectContaining({ id: "profile.vanilla-web" }),
          ]),
        }),
      }),
    );
    await expect(
      registry.invoke("play_teaching_scene", {
        id: "scene.fixture",
        beats: [{ id: "beat.fixture" }],
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        status: "started",
        data: { mock: true, toolName: "play_teaching_scene" },
      }),
    );
  });

  it("validates inputs before invoking handlers", async () => {
    const registry = createEarlyWebMCPToolRegistry(createP0ProviderPlatform());

    await expect(
      registry.invoke("execute_environment_action", {
        actionId: "runtime.run",
        shellCommand: "unsafe",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        ok: false,
        status: "failed",
        error: {
          code: "invalid_input",
          message: "The tool input did not match the closed schema.",
          recoverable: true,
        },
      }),
    );
  });

  it("rejects duplicate public tool names", () => {
    const registry = new ToolRegistry();
    const definition = {
      name: "get_system_capabilities" as const,
      title: "Capabilities",
      description: "Fixture",
      inputSchema: WEBMCP_TOOL_INPUT_SCHEMAS.get_system_capabilities,
      handler: () => ({
        ok: true,
        status: "completed" as const,
      }),
    };

    registry.register(definition);
    expect(() => registry.register(definition)).toThrow(DuplicateToolDefinitionError);
  });
});
