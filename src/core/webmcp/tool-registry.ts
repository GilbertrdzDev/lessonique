import type { z } from "zod";

import type {
  ToolHandler,
  ToolResult,
  WebMCPToolInputMap,
} from "./contracts";
import type { WebMCPToolName } from "./tool-names";

export type ToolDefinition<TName extends WebMCPToolName> = {
  name: TName;
  title: string;
  description: string;
  inputSchema: z.ZodType<WebMCPToolInputMap[TName]>;
  handler: ToolHandler<TName>;
};

type StoredToolDefinition = {
  name: WebMCPToolName;
  title: string;
  description: string;
  inputSchema: z.ZodType;
  invoke: (input: unknown) => Promise<ToolResult<unknown>>;
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

  register<TName extends WebMCPToolName>(definition: ToolDefinition<TName>): void {
    if (this.#definitions.has(definition.name)) {
      throw new DuplicateToolDefinitionError(definition.name);
    }
    this.#definitions.set(definition.name, {
      name: definition.name,
      title: definition.title,
      description: definition.description,
      inputSchema: definition.inputSchema,
      invoke: async (input) => definition.handler(definition.inputSchema.parse(input)),
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

  invoke(name: WebMCPToolName, input: unknown): Promise<ToolResult<unknown>> {
    return this.require(name).invoke(input);
  }
}
