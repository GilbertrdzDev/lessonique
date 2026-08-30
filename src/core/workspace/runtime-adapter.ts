import type {
  EnvironmentActionId,
  RuntimeProviderId,
} from "@/core/platform/identifiers";

import type {
  EnvironmentActionResult,
  RuntimeSnapshot,
  WorkspaceFile,
  WorkspaceFileOperation,
} from "./contracts";

export interface RuntimeAdapter {
  readonly providerId: RuntimeProviderId;
  replaceFiles(files: readonly WorkspaceFile[]): Promise<void>;
  applyOperations(operations: readonly WorkspaceFileOperation[]): Promise<void>;
  executeAction(
    actionId: EnvironmentActionId,
    input?: unknown,
  ): Promise<EnvironmentActionResult>;
  getSnapshot(): RuntimeSnapshot;
  reset?(): Promise<void>;
  dispose(): Promise<void>;
}

export interface RuntimeAdapterResolver {
  get(providerId: RuntimeProviderId): RuntimeAdapter;
}
