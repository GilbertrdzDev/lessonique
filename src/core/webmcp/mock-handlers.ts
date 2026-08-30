import { CapabilityCatalog } from "@/core/platform/capability-catalog";
import type { ProviderPlatformRegistries } from "@/core/platform/registries";
import type { z } from "zod";

import {
  CapabilityValidator,
  GetSystemCapabilitiesService,
} from "./capabilities";
import type {
  ToolHandler,
  ToolResult,
  WebMCPToolInputMap,
} from "./contracts";
import { WEBMCP_TOOL_INPUT_SCHEMAS } from "./schemas";
import { ToolRegistry, type ToolDefinition } from "./tool-registry";
import { WEBMCP_TOOL_NAMES, type WebMCPToolName } from "./tool-names";

const TOOL_METADATA = {
  get_system_capabilities: {
    title: "Get system capabilities",
    description: "Discover registered profiles, providers, surfaces, actions, guidance capabilities, and limits.",
  },
  create_guided_lesson: {
    title: "Create guided lesson",
    description: "Create or replace a complete guided lesson transactionally.",
  },
  reset_classroom: {
    title: "Reset classroom",
    description: "Clear a declared classroom lifecycle scope idempotently.",
  },
  inspect_classroom: {
    title: "Inspect classroom",
    description: "Inspect a bounded, filtered snapshot of the active classroom.",
  },
  configure_learning_environment: {
    title: "Configure learning environment",
    description: "Reconfigure registered profiles, providers, files, surfaces, and scalar options.",
  },
  apply_workspace_changes: {
    title: "Apply workspace changes",
    description: "Apply an atomic batch of validated workspace file operations.",
  },
  execute_environment_action: {
    title: "Execute environment action",
    description: "Execute a capability-declared runtime, profile, or surface action.",
  },
  play_teaching_scene: {
    title: "Play teaching scene",
    description: "Start a visual teaching scene using semantic targets and registered guidance capabilities.",
  },
  control_teaching_scene: {
    title: "Control teaching scene",
    description: "Pause, resume, navigate, restart, or cancel the active teaching scene.",
  },
  evaluate_current_step: {
    title: "Evaluate current step",
    description: "Evaluate the active lesson step with its declared criteria.",
  },
  update_lesson_plan: {
    title: "Update lesson plan",
    description: "Adapt lesson steps, active progress, hints, or the agent message without changing the workspace.",
  },
  show_reference_panel: {
    title: "Show reference panel",
    description: "Create or replace a structured, non-modal reference panel.",
  },
} as const satisfies Record<WebMCPToolName, { title: string; description: string }>;

export function createEarlyWebMCPToolRegistry(
  registries: ProviderPlatformRegistries,
): ToolRegistry {
  const registry = new ToolRegistry();
  const capabilities = new GetSystemCapabilitiesService(
    new CapabilityCatalog(registries),
    new CapabilityValidator(registries),
  );
  let operationSequence = 0;

  registerDefinition(registry, {
    name: "get_system_capabilities",
    ...TOOL_METADATA.get_system_capabilities,
    inputSchema: WEBMCP_TOOL_INPUT_SCHEMAS.get_system_capabilities,
    handler: (input) => ({
      ok: true,
      operationId: `early-capabilities-${++operationSequence}`,
      status: "completed",
      data: capabilities.execute(input),
    }),
  });

  WEBMCP_TOOL_NAMES.filter((name) => name !== "get_system_capabilities").forEach((name) => {
    registerMockDefinition(registry, name, () => ++operationSequence);
  });

  return registry;
}

function registerMockDefinition<TName extends Exclude<WebMCPToolName, "get_system_capabilities">>(
  registry: ToolRegistry,
  name: TName,
  nextOperationSequence: () => number,
): void {
  const handler: ToolHandler<TName> = () => {
    const result: ToolResult<{ mock: true; toolName: TName }> = {
      ok: true,
      operationId: `early-${name}-${nextOperationSequence()}`,
      status: name === "play_teaching_scene" ? "started" : "completed",
      data: { mock: true, toolName: name },
    };
    return result;
  };
  registerDefinition(registry, {
    name,
    ...TOOL_METADATA[name],
    inputSchema: getInputSchema(name),
    handler,
  });
}

function getInputSchema<TName extends WebMCPToolName>(
  name: TName,
): z.ZodType<WebMCPToolInputMap[TName]> {
  return WEBMCP_TOOL_INPUT_SCHEMAS[name] as unknown as z.ZodType<
    WebMCPToolInputMap[TName]
  >;
}

function registerDefinition<TName extends WebMCPToolName>(
  registry: ToolRegistry,
  definition: ToolDefinition<TName>,
): void {
  registry.register(definition);
}
