export type ClassroomResourceKind =
  | "scene"
  | "visual-guide"
  | "assistant-motion"
  | "observer"
  | "interaction"
  | "wait"
  | "timer"
  | "overlay"
  | "validation"
  | "runtime";

export type ClassroomCleanupScope =
  | "guidance"
  | "runtime"
  | "workspace"
  | "lesson"
  | "all";

export type ClassroomCleanupReason =
  | "reset"
  | "lesson-replacement"
  | "scene-replacement"
  | "cancellation"
  | "rollback";

export interface ClassroomLifecycleResource {
  id: string;
  kind: ClassroomResourceKind;
  dispose(context: {
    scope: ClassroomCleanupScope;
    reason: ClassroomCleanupReason;
  }): Promise<void> | void;
}

export interface ClassroomCleanupFailure {
  id: string;
  kind: ClassroomResourceKind;
  message: string;
}

export interface ClassroomCleanupResult {
  scope: ClassroomCleanupScope;
  reason: ClassroomCleanupReason;
  disposed: number;
  retained: number;
  failures: readonly ClassroomCleanupFailure[];
}

export interface ClassroomLifecycleSnapshot {
  total: number;
  resourceIds: readonly string[];
  counts: Readonly<Record<ClassroomResourceKind, number>>;
  cleaning: boolean;
}

type RegisteredResource = {
  key: string;
  resource: ClassroomLifecycleResource;
};

const RESOURCE_KINDS = [
  "scene",
  "visual-guide",
  "assistant-motion",
  "observer",
  "interaction",
  "wait",
  "timer",
  "overlay",
  "validation",
  "runtime",
] as const satisfies readonly ClassroomResourceKind[];

const GUIDANCE_KINDS = new Set<ClassroomResourceKind>([
  "scene",
  "visual-guide",
  "assistant-motion",
  "observer",
  "interaction",
  "wait",
  "timer",
  "overlay",
]);

export class ClassroomLifecycleService {
  readonly #resources = new Map<string, RegisteredResource>();
  #cleaning = false;

  register(resource: ClassroomLifecycleResource): () => void {
    if (this.#cleaning) {
      throw new Error("Classroom resources cannot be registered during cleanup.");
    }
    const key = resourceKey(resource.kind, resource.id);
    if (this.#resources.has(key)) {
      throw new Error(
        `Classroom resource "${resource.kind}:${resource.id}" is already registered.`,
      );
    }
    const registration = { key, resource };
    this.#resources.set(key, registration);
    return () => {
      if (this.#resources.get(key) === registration) {
        this.#resources.delete(key);
      }
    };
  }

  getSnapshot(): ClassroomLifecycleSnapshot {
    const registrations = [...this.#resources.values()];
    const counts = Object.fromEntries(
      RESOURCE_KINDS.map((kind) => [
        kind,
        registrations.filter(({ resource }) => resource.kind === kind).length,
      ]),
    ) as Record<ClassroomResourceKind, number>;
    return {
      total: registrations.length,
      resourceIds: registrations.map(({ resource }) => resource.id),
      counts,
      cleaning: this.#cleaning,
    };
  }

  async cleanup(
    scope: ClassroomCleanupScope,
    reason: ClassroomCleanupReason = "reset",
  ): Promise<ClassroomCleanupResult> {
    if (this.#cleaning) {
      throw new Error("Classroom cleanup is already in progress.");
    }
    this.#cleaning = true;
    const failures: ClassroomCleanupFailure[] = [];
    let disposed = 0;
    try {
      const registrations = [...this.#resources.values()]
        .filter(({ resource }) => scopeIncludes(scope, resource.kind))
        .reverse();
      for (const registration of registrations) {
        try {
          await registration.resource.dispose({ scope, reason });
          if (this.#resources.get(registration.key) === registration) {
            this.#resources.delete(registration.key);
          }
          disposed += 1;
        } catch (error) {
          failures.push({
            id: registration.resource.id,
            kind: registration.resource.kind,
            message: error instanceof Error ? error.message : "Resource cleanup failed.",
          });
        }
      }
    } finally {
      this.#cleaning = false;
    }
    return {
      scope,
      reason,
      disposed,
      retained: this.#resources.size,
      failures,
    };
  }
}

function scopeIncludes(
  scope: ClassroomCleanupScope,
  kind: ClassroomResourceKind,
): boolean {
  switch (scope) {
    case "guidance":
      return GUIDANCE_KINDS.has(kind);
    case "runtime":
      return kind === "runtime" || kind === "validation";
    case "workspace":
      return kind === "runtime" || kind === "validation";
    case "lesson":
      return GUIDANCE_KINDS.has(kind) || kind === "validation";
    case "all":
      return true;
  }
}

function resourceKey(kind: ClassroomResourceKind, id: string): string {
  return `${kind}:${id}`;
}
