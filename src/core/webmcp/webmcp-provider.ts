import type { ToolResult } from "./contracts";
import { getWebMCPToolJsonSchema, type WebMCPJsonSchema } from "./schemas";
import type { ToolRegistry } from "./tool-registry";
import type { WebMCPToolName } from "./tool-names";

export type BrowserWebMCPTool = {
  name: WebMCPToolName;
  title: string;
  description: string;
  inputSchema: WebMCPJsonSchema;
  execute: (input: unknown) => Promise<ToolResult<unknown>>;
};

export type BrowserModelContext = {
  registerTool: (
    tool: BrowserWebMCPTool,
    options?: { signal?: AbortSignal },
  ) => Promise<void>;
};

export type WebMCPProviderStatus =
  | "idle"
  | "registering"
  | "ready"
  | "unavailable"
  | "failed"
  | "stopped";

type ModelContextResolver = () => BrowserModelContext | undefined;
type AgentInvocationListener = (toolName: WebMCPToolName) => void;

export class WebMCPProvider {
  readonly #registry: ToolRegistry;
  readonly #resolveModelContext: ModelContextResolver;
  readonly #onAgentInvocation?: AgentInvocationListener;
  #abortController?: AbortController;
  #registration?: Promise<WebMCPProviderStatus>;
  #status: WebMCPProviderStatus = "idle";

  constructor(
    registry: ToolRegistry,
    resolveModelContext: ModelContextResolver = resolveDocumentModelContext,
    onAgentInvocation?: AgentInvocationListener,
  ) {
    this.#registry = registry;
    this.#resolveModelContext = resolveModelContext;
    this.#onAgentInvocation = onAgentInvocation;
  }

  get status(): WebMCPProviderStatus {
    return this.#status;
  }

  hasBrowserSurface(): boolean {
    return this.#resolveModelContext() !== undefined;
  }

  async start(): Promise<WebMCPProviderStatus> {
    if (this.#status === "ready") {
      return this.#status;
    }
    if (this.#registration) {
      const settledStatus = await this.#registration;
      if (settledStatus === "ready" || settledStatus === "unavailable") {
        return settledStatus;
      }
    }

    const modelContext = this.#resolveModelContext();
    if (!modelContext) {
      this.#status = "unavailable";
      return this.#status;
    }

    const controller = new AbortController();
    this.#abortController = controller;
    this.#status = "registering";
    this.#registration = this.#registerAll(modelContext, controller);
    try {
      return await this.#registration;
    } finally {
      this.#registration = undefined;
    }
  }

  stop(): void {
    this.#abortController?.abort();
    this.#abortController = undefined;
    this.#status = "stopped";
  }

  async #registerAll(
    modelContext: BrowserModelContext,
    controller: AbortController,
  ): Promise<WebMCPProviderStatus> {
    try {
      for (const definition of this.#registry.list()) {
        if (controller.signal.aborted) {
          this.#status = "stopped";
          return this.#status;
        }
        await modelContext.registerTool(
          {
            name: definition.name,
            title: definition.title,
            description: definition.description,
            inputSchema: getWebMCPToolJsonSchema(definition.name),
            execute: (input) => {
              this.#onAgentInvocation?.(definition.name);
              return definition.invoke(input);
            },
          },
          { signal: controller.signal },
        );
      }
      this.#status = controller.signal.aborted ? "stopped" : "ready";
      return this.#status;
    } catch (error) {
      if (controller.signal.aborted) {
        this.#status = "stopped";
        return this.#status;
      }
      controller.abort();
      this.#status = "failed";
      throw error;
    }
  }
}

function resolveDocumentModelContext(): BrowserModelContext | undefined {
  if (typeof document === "undefined") {
    return undefined;
  }
  return (document as Document & { modelContext?: BrowserModelContext }).modelContext;
}
