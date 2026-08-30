import {
  ExecutableValidatorRegistry,
  ValidationEngine,
  ValidationResultSnapshotStore,
} from "@/core/code-intelligence";
import type { ProviderPlatformRegistries } from "@/core/platform/registries";
import type { WorkspaceStateReader } from "@/core/workspace";

import type { P0CodeIntelligenceRuntime } from "./runtime";
import {
  createP0ExecutableValidators,
  type PreviewValidationPort,
} from "./validators";

export interface P0ValidationRuntime {
  engine: ValidationEngine;
  validators: ExecutableValidatorRegistry;
  results: ValidationResultSnapshotStore;
}

export function createP0ValidationRuntime(
  platform: ProviderPlatformRegistries,
  intelligence: P0CodeIntelligenceRuntime,
  workspace: WorkspaceStateReader,
  preview: PreviewValidationPort,
): P0ValidationRuntime {
  const validators = new ExecutableValidatorRegistry();
  const results = new ValidationResultSnapshotStore();
  createP0ExecutableValidators({
    workspace,
    intelligence: intelligence.service,
    preview,
  }).forEach((validator) => validators.register(validator));
  return {
    validators,
    engine: new ValidationEngine(validators, {
      platform,
      changes: workspace,
      results,
    }),
    results,
  };
}
