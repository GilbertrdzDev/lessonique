import type {
  ClassroomLifecycleResource,
  ClassroomResourceKind,
  ClassroomLifecycleService,
} from "@/core/lesson";

type ScopedResource = {
  id: string;
  dispose(): Promise<void>;
  release(): void;
};

export class SceneLifecycleScope {
  readonly #lifecycle: ClassroomLifecycleService;
  readonly #resources = new Map<string, ScopedResource>();
  readonly #controller = new AbortController();
  readonly #releaseScene: () => void;
  #disposed = false;

  constructor(sceneId: string, lifecycle: ClassroomLifecycleService) {
    this.#lifecycle = lifecycle;
    this.#releaseScene = lifecycle.register({
      id: sceneId,
      kind: "scene",
      dispose: () => this.dispose(),
    });
  }

  get signal(): AbortSignal {
    return this.#controller.signal;
  }

  get disposed(): boolean {
    return this.#disposed;
  }

  add(
    resource: Omit<ClassroomLifecycleResource, "dispose"> & {
      dispose(): Promise<void> | void;
    },
  ): () => Promise<void> {
    if (this.#disposed) {
      throw new Error("Scene resources cannot be added to a disposed scope.");
    }
    const key = `${resource.kind}:${resource.id}`;
    if (this.#resources.has(key)) {
      throw new Error(`Scene resource "${key}" is already registered.`);
    }
    let disposed = false;
    let disposing = false;
    const dispose = async () => {
      if (disposed || disposing) return;
      disposing = true;
      try {
        await resource.dispose();
        disposed = true;
        registration.release();
        this.#resources.delete(key);
      } finally {
        disposing = false;
      }
    };
    const release = this.#lifecycle.register({
      id: resource.id,
      kind: resource.kind,
      dispose,
    });
    const registration: ScopedResource = { id: key, dispose, release };
    this.#resources.set(key, registration);
    return dispose;
  }

  addAbortController(
    id: string,
    kind: ClassroomResourceKind = "observer",
  ): AbortController {
    const controller = new AbortController();
    const abort = () => controller.abort(this.signal.reason);
    this.signal.addEventListener("abort", abort, { once: true });
    this.add({
      id,
      kind,
      dispose: () => {
        this.signal.removeEventListener("abort", abort);
        controller.abort();
      },
    });
    return controller;
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#controller.abort();
    const failures: unknown[] = [];
    for (const resource of [...this.#resources.values()].reverse()) {
      try {
        await resource.dispose();
      } catch (error) {
        failures.push(error);
      }
    }
    this.#releaseScene();
    if (failures.length > 0) {
      throw new AggregateError(failures, "Scene cleanup failed.");
    }
  }
}
