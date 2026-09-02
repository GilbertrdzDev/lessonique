import {
  GUIDE_BUILD_STAGE_IDS,
  GuideBuildService,
  GuideBuildTransitionError,
  type GuideBuildSnapshot,
} from "@/core/guide-build";

import type {
  SetGuideBuildStatusInput,
  ToolExecutionResult,
} from "./contracts";
import { ToolInvocationError } from "./tool-invocation-service";

export type SetGuideBuildStatusData = ReturnType<typeof toGuideBuildData>;

export class SetGuideBuildStatusService {
  readonly #guideBuild: GuideBuildService;

  constructor(guideBuild: GuideBuildService) {
    this.#guideBuild = guideBuild;
  }

  execute(
    input: SetGuideBuildStatusInput,
  ): ToolExecutionResult<SetGuideBuildStatusData> {
    try {
      const snapshot = this.#guideBuild.setStatus(
        input.status === "building"
          ? {
              status: "building",
              stage: input.stage!,
              ...(input.message ? { message: input.message } : {}),
            }
          : input.status === "error"
            ? { status: "error", message: input.message! }
            : { status: "completed" },
      );
      return {
        ok: true,
        status: "completed",
        revision: snapshot.revision,
        data: toGuideBuildData(snapshot),
      };
    } catch (error) {
      if (error instanceof GuideBuildTransitionError) {
        throw new ToolInvocationError({
          code: error.code,
          message: error.message,
          recoverable: true,
          supportedAlternatives:
            error.code === "guide_build_not_complete"
              ? ["create_guided_lesson"]
              : [...GUIDE_BUILD_STAGE_IDS],
        });
      }
      throw error;
    }
  }
}
function toGuideBuildData(snapshot: GuideBuildSnapshot) {
  return {
    guideBuildStatus: snapshot.status,
    stage: snapshot.stage ?? null,
    message: snapshot.message ?? null,
    evidence: { revision: snapshot.revision },
  };
}
