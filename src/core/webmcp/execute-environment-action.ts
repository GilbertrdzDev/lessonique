import type { ProviderPlatformRegistries } from "@/core/platform/registries";
import type { WorkspaceController } from "@/core/workspace/workspace-controller";

import { CapabilityValidator } from "./capabilities";
import type {
  ExecuteEnvironmentActionInput,
  ToolExecutionResult,
} from "./contracts";
import { ToolInvocationError } from "./tool-invocation-service";

export type ExecuteEnvironmentActionData = {
  actionId: string;
  ownerType: "runtime" | "profile" | "surface";
  ownerId: string;
  accepted: boolean;
  message: string;
  waitForCompletion: boolean;
  evidence: {
    environmentRevision: number;
    runtimeRevision: number;
    runtimeStatus: string;
  };
};

export class ExecuteEnvironmentActionService {
  readonly #controller: WorkspaceController;
  readonly #validator: CapabilityValidator;

  constructor(
    controller: WorkspaceController,
    registries: ProviderPlatformRegistries,
  ) {
    this.#controller = controller;
    this.#validator = new CapabilityValidator(registries);
  }

  validate(input: ExecuteEnvironmentActionInput): void {
    const state = this.#controller.store.getSnapshot();
    if (!state.profileId) {
      throw new ToolInvocationError({
        code: "workspace_unavailable",
        message: "The workspace does not have an active environment.",
        recoverable: true,
        supportedAlternatives: ["create_guided_lesson", "configure_learning_environment"],
      });
    }
    this.#validator.validateAction(
      input.actionId,
      input.input ?? {},
      state.profileId,
    );
  }

  async execute(
    input: ExecuteEnvironmentActionInput,
  ): Promise<ToolExecutionResult<ExecuteEnvironmentActionData>> {
    this.validate(input);
    const action = this.#validator.validateAction(
      input.actionId,
      input.input ?? {},
      this.#controller.store.getSnapshot().profileId,
    );
    const result = await this.#controller.executeAction(
      input.actionId,
      input.input ?? {},
    );
    if (!result.accepted) {
      throw new ToolInvocationError({
        code: "environment_action_rejected",
        message: result.message,
        recoverable: true,
      });
    }
    const state = this.#controller.store.getSnapshot();
    return {
      ok: true,
      status: "completed",
      revision: state.environmentRevision,
      data: {
        actionId: action.id,
        ownerType: action.ownerType,
        ownerId: action.ownerId,
        accepted: result.accepted,
        message: result.message,
        waitForCompletion: input.waitForCompletion ?? true,
        evidence: {
          environmentRevision: state.environmentRevision,
          runtimeRevision: state.runtime.revision,
          runtimeStatus: state.runtime.status,
        },
      },
    };
  }
}
