import type { z } from "zod";

import type {
  ToolCapabilityCheck,
  ToolHandler,
  ToolResult,
  WebMCPToolInputMap,
} from "./contracts";
import type { ToolActivityLogger, ToolActivityListener } from "./tool-activity-logger";
import {
  ToolInvocationService,
  type ToolInvocationOptions,
} from "./tool-invocation-service";
import type { WebMCPToolName } from "./tool-names";

export type ToolDefinition<TName extends WebMCPToolName> = {
  name: TName;
  title: string;
  description: string;
  inputSchema: z.ZodType<WebMCPToolInputMap[TName]>;
  capabilityCheck?: ToolCapabilityCheck<TName>;
  handler: ToolHandler<TName>;
};

type StoredToolDefinition = {
  name: WebMCPToolName;
  title: string;
  description: string;
  inputSchema: z.ZodType;
  invoke: (
    input: unknown,
    options?: ToolInvocationOptions,
  ) => Promise<ToolResult<unknown>>;
};

export class DuplicateToolDefinitionError extends Error {
  constructor(name: WebMCPToolName) {
    super(`Tool Registry already contains "${name}".`);
    this.name = "DuplicateToolDefinitionError";
  }
}

export class MissingToolDefinitionError extends Error {
  constructor(name: WebMCPToolName) {
    super(`Tool Registry does not contain "${name}".`);
    this.name = "MissingToolDefinitionError";
  }
}

export class ToolRegistry {
  readonly #definitions = new Map<WebMCPToolName, StoredToolDefinition>();
  readonly #invocations: ToolInvocationService;

  constructor(invocations = new ToolInvocationService()) {
    this.#invocations = invocations;
  }

  get activityLogger(): ToolActivityLogger {
    return this.#invocations.activityLogger;
  }

  subscribe(listener: ToolActivityListener): () => void {
    return this.#invocations.subscribe(listener);
  }

  register<TName extends WebMCPToolName>(definition: ToolDefinition<TName>): void {
    if (this.#definitions.has(definition.name)) {
      throw new DuplicateToolDefinitionError(definition.name);
    }
    this.#definitions.set(definition.name, {
      name: definition.name,
      title: definition.title,
      description: definition.description,
      inputSchema: definition.inputSchema,
      invoke: (input, options) => this.#invocations.invoke(definition, input, options),
    });
  }

  require(name: WebMCPToolName): StoredToolDefinition {
    const definition = this.#definitions.get(name);
    if (!definition) {
      throw new MissingToolDefinitionError(name);
    }
    return definition;
  }

  list(): StoredToolDefinition[] {
    return [...this.#definitions.values()];
  }

  invoke(
    name: WebMCPToolName,
    input: unknown,
    options?: ToolInvocationOptions,
  ): Promise<ToolResult<unknown>> {
    return this.require(name).invoke(input, options);
  }
}
