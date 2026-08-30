import type {
  EnvironmentActionId,
  RuntimeProviderId,
} from "@/core/platform/identifiers";
import type {
  EnvironmentActionResult,
  RuntimeSnapshot,
  WorkspaceFile,
  WorkspaceFileOperation,
} from "@/core/workspace/contracts";
import type { RuntimeAdapter } from "@/core/workspace/runtime-adapter";

export interface SandpackRuntimeHost {
  replaceFiles(files: Readonly<Record<string, string>>): Promise<void>;
  run(): Promise<void>;
  stop(): Promise<void>;
  restart(): Promise<void>;
  clearConsole(): Promise<void>;
}

export interface SandpackRuntimeActionIds {
  run: EnvironmentActionId;
  stop: EnvironmentActionId;
  restart: EnvironmentActionId;
  clearConsole: EnvironmentActionId;
}

export class SandpackRuntimeAdapter implements RuntimeAdapter {
  readonly providerId: RuntimeProviderId;
  readonly #actionIds: SandpackRuntimeActionIds;
  #host?: SandpackRuntimeHost;
  #files: WorkspaceFile[] = [];
  #status: RuntimeSnapshot["status"] = "idle";
  #revision = 0;
  #errorMessage?: string;

  constructor(
    providerId: RuntimeProviderId,
    actionIds: SandpackRuntimeActionIds,
  ) {
    this.providerId = providerId;
    this.#actionIds = actionIds;
  }

  attachHost(host: SandpackRuntimeHost): () => void {
    this.#host = host;
    void this.#syncHostFiles();
    return () => {
      if (this.#host === host) {
        this.#host = undefined;
      }
    };
  }

  async replaceFiles(files: readonly WorkspaceFile[]): Promise<void> {
    const previousFiles = this.#files;
    this.#files = files.map((file) => ({ ...file }));
    try {
      await this.#syncHostFiles();
      this.#status = "ready";
      this.#revision += 1;
      this.#errorMessage = undefined;
    } catch (error) {
      this.#files = previousFiles;
      this.#status = "error";
      this.#errorMessage = getErrorMessage(error);
      throw error;
    }
  }

  async applyOperations(
    operations: readonly WorkspaceFileOperation[],
  ): Promise<void> {
    const nextFiles = this.#files.map((file) => ({ ...file }));
    operations.forEach((operation) => {
      const path = operation.type === "create" ? operation.file.path : operation.path;
      const index = nextFiles.findIndex((file) => file.path === path);
      if (operation.type === "create") {
        nextFiles.push({ ...operation.file });
      } else if (operation.type === "delete") {
        if (index >= 0) {
          nextFiles.splice(index, 1);
        }
      } else if (index >= 0) {
        const current = nextFiles[index];
        if (current) {
          nextFiles[index] = { ...current, content: operation.content };
        }
      }
    });
    await this.replaceFiles(nextFiles);
  }

  async executeAction(
    actionId: EnvironmentActionId,
  ): Promise<EnvironmentActionResult> {
    const host = this.#host;
    if (!host) {
      return {
        actionId,
        accepted: false,
        message: "The Sandpack runtime surface is not mounted.",
      };
    }
    try {
      if (actionId === this.#actionIds.run) {
        this.#status = "running";
        await host.run();
        this.#status = "ready";
      } else if (actionId === this.#actionIds.stop) {
        await host.stop();
        this.#status = "stopped";
      } else if (actionId === this.#actionIds.restart) {
        this.#status = "preparing";
        await host.restart();
        this.#status = "ready";
      } else if (actionId === this.#actionIds.clearConsole) {
        await host.clearConsole();
      } else {
        return {
          actionId,
          accepted: false,
          message: `Sandpack runtime action "${actionId}" is not supported.`,
        };
      }
      this.#revision += 1;
      this.#errorMessage = undefined;
      return {
        actionId,
        accepted: true,
        message: `Sandpack runtime action "${actionId}" completed.`,
      };
    } catch (error) {
      this.#status = "error";
      this.#errorMessage = getErrorMessage(error);
      throw error;
    }
  }

  getSnapshot(): RuntimeSnapshot {
    return {
      providerId: this.providerId,
      status: this.#status,
      revision: this.#revision,
      files: this.#files.map((file) => ({ ...file })),
      ...(this.#errorMessage ? { errorMessage: this.#errorMessage } : {}),
    };
  }

  async reset(): Promise<void> {
    if (this.#host) {
      await this.#host.stop();
      await this.#host.clearConsole();
    }
    this.#status = "stopped";
    this.#revision += 1;
    this.#errorMessage = undefined;
  }

  async dispose(): Promise<void> {
    this.#host = undefined;
    this.#status = "stopped";
  }

  async #syncHostFiles(): Promise<void> {
    if (!this.#host) {
      return;
    }
    await this.#host.replaceFiles(
      Object.fromEntries(this.#files.map(({ path, content }) => [`/${path}`, content])),
    );
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The Sandpack runtime failed.";
}
