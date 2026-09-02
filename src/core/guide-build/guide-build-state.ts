export const GUIDE_BUILD_STAGE_IDS = [
  "understanding-goal",
  "preparing-lesson",
  "setting-up-classroom",
] as const;

export type GuideBuildStageId = (typeof GUIDE_BUILD_STAGE_IDS)[number];
export type GuideBuildStatus = "idle" | "building" | "completed" | "error";

export type GuideBuildSnapshot = Readonly<{
  status: GuideBuildStatus;
  stage?: GuideBuildStageId;
  message?: string;
  revision: number;
}>;

export type SetGuideBuildStatusCommand =
  | Readonly<{
      status: "building";
      stage: GuideBuildStageId;
      message?: string;
    }>
  | Readonly<{
      status: "completed";
    }>
  | Readonly<{
      status: "error";
      message: string;
    }>;

export class GuideBuildTransitionError extends Error {
  readonly code:
    | "guide_build_not_complete"
    | "guide_build_stage_out_of_order";

  constructor(
    code: GuideBuildTransitionError["code"],
    message: string,
  ) {
    super(message);
    this.name = "GuideBuildTransitionError";
    this.code = code;
  }
}

export class GuideBuildStore {
  #snapshot: GuideBuildSnapshot = { status: "idle", revision: 0 };
  readonly #listeners = new Set<() => void>();

  getSnapshot = (): GuideBuildSnapshot => this.#snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  commit(next: Omit<GuideBuildSnapshot, "revision">): GuideBuildSnapshot {
    if (snapshotsEqual(this.#snapshot, next)) return this.#snapshot;
    this.#snapshot = {
      ...next,
      revision: this.#snapshot.revision + 1,
    };
    this.#listeners.forEach((listener) => listener());
    return this.#snapshot;
  }
}

export class GuideBuildService {
  readonly store: GuideBuildStore;

  constructor(store = new GuideBuildStore()) {
    this.store = store;
  }

  setStatus(command: SetGuideBuildStatusCommand): GuideBuildSnapshot {
    const current = this.store.getSnapshot();
    if (command.status === "completed") {
      if (current.status !== "completed") {
        throw new GuideBuildTransitionError(
          "guide_build_not_complete",
          "The guide can be completed only by a successful classroom transaction.",
        );
      }
      return current;
    }
    if (command.status === "error") {
      return this.fail(command.message);
    }

    const nextRank = stageRank(command.stage);
    if (current.status === "building") {
      const currentRank = stageRank(current.stage ?? GUIDE_BUILD_STAGE_IDS[0]);
      if (nextRank < currentRank || nextRank > currentRank + 1) {
        throw new GuideBuildTransitionError(
          "guide_build_stage_out_of_order",
          "Guide build stages must advance one step at a time.",
        );
      }
    } else if (command.stage !== GUIDE_BUILD_STAGE_IDS[0]) {
      throw new GuideBuildTransitionError(
        "guide_build_stage_out_of_order",
        "A guide build must start by understanding the learner goal.",
      );
    }

    return this.store.commit({
      status: "building",
      stage: command.stage,
      ...(command.message ? { message: command.message } : {}),
    });
  }

  beginClassroomSetup(): GuideBuildSnapshot {
    const current = this.store.getSnapshot();
    if (
      current.status === "building" &&
      current.stage === "setting-up-classroom"
    ) {
      return current;
    }
    return this.store.commit({
      status: "building",
      stage: "setting-up-classroom",
      message: "Configuring your workspace",
    });
  }

  complete(): GuideBuildSnapshot {
    return this.store.commit({
      status: "completed",
      stage: "setting-up-classroom",
      message: "Your classroom is ready",
    });
  }

  fail(
    message = "Lessonique could not finish building this guide.",
  ): GuideBuildSnapshot {
    const current = this.store.getSnapshot();
    return this.store.commit({
      status: "error",
      ...(current.stage ? { stage: current.stage } : {}),
      message,
    });
  }

  reset(): GuideBuildSnapshot {
    return this.store.commit({ status: "idle" });
  }
}

function stageRank(stage: GuideBuildStageId): number {
  return GUIDE_BUILD_STAGE_IDS.indexOf(stage);
}

function snapshotsEqual(
  current: GuideBuildSnapshot,
  next: Omit<GuideBuildSnapshot, "revision">,
): boolean {
  return (
    current.status === next.status &&
    current.stage === next.stage &&
    current.message === next.message
  );
}
