import { describe, expect, it, vi } from "vitest";

import {
  ClassroomLifecycleService,
  type ClassroomResourceKind,
} from "./lifecycle";

const ALL_KINDS = [
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

describe("ClassroomLifecycleService", () => {
  it("cleans every owned resource in reverse registration order", async () => {
    const lifecycle = new ClassroomLifecycleService();
    const disposalOrder: string[] = [];
    ALL_KINDS.forEach((kind) => {
      lifecycle.register({
        id: `${kind}.1`,
        kind,
        dispose: ({ reason }) => {
          expect(reason).toBe("lesson-replacement");
          disposalOrder.push(kind);
        },
      });
    });

    const result = await lifecycle.cleanup("all", "lesson-replacement");

    expect(disposalOrder).toEqual([...ALL_KINDS].reverse());
    expect(result).toEqual({
      scope: "all",
      reason: "lesson-replacement",
      disposed: 10,
      retained: 0,
      failures: [],
    });
    expect(lifecycle.getSnapshot().total).toBe(0);
  });

  it("cleans only resources owned by the requested scope", async () => {
    const lifecycle = new ClassroomLifecycleService();
    ALL_KINDS.forEach((kind) => {
      lifecycle.register({ id: `${kind}.1`, kind, dispose: vi.fn() });
    });

    const guidanceResult = await lifecycle.cleanup("guidance");
    expect(guidanceResult.disposed).toBe(8);
    expect(lifecycle.getSnapshot()).toEqual(
      expect.objectContaining({
        total: 2,
        resourceIds: ["validation.1", "runtime.1"],
      }),
    );

    const runtimeResult = await lifecycle.cleanup("runtime");
    expect(runtimeResult.disposed).toBe(2);
    expect(lifecycle.getSnapshot().total).toBe(0);
  });

  it("is idempotent after successful cleanup and supports later registrations", async () => {
    const lifecycle = new ClassroomLifecycleService();
    const dispose = vi.fn();
    lifecycle.register({ id: "scene.1", kind: "scene", dispose });

    await lifecycle.cleanup("all", "cancellation");
    const repeated = await lifecycle.cleanup("all", "cancellation");
    lifecycle.register({ id: "scene.2", kind: "scene", dispose });

    expect(dispose).toHaveBeenCalledOnce();
    expect(repeated.disposed).toBe(0);
    expect(lifecycle.getSnapshot().resourceIds).toEqual(["scene.2"]);
  });

  it("continues after cleanup failures and retains failed resources for retry", async () => {
    const lifecycle = new ClassroomLifecycleService();
    const successfulDispose = vi.fn();
    const failedDispose = vi
      .fn<() => void>()
      .mockImplementationOnce(() => {
        throw new Error("fixture cleanup failed");
      });
    lifecycle.register({
      id: "runtime.success",
      kind: "runtime",
      dispose: successfulDispose,
    });
    lifecycle.register({
      id: "runtime.failed",
      kind: "runtime",
      dispose: failedDispose,
    });

    const first = await lifecycle.cleanup("runtime", "rollback");
    expect(successfulDispose).toHaveBeenCalledOnce();
    expect(first).toEqual({
      scope: "runtime",
      reason: "rollback",
      disposed: 1,
      retained: 1,
      failures: [
        {
          id: "runtime.failed",
          kind: "runtime",
          message: "fixture cleanup failed",
        },
      ],
    });

    const second = await lifecycle.cleanup("runtime", "rollback");
    expect(second.failures).toEqual([]);
    expect(lifecycle.getSnapshot().total).toBe(0);
  });

  it("rejects duplicate resources and registrations during cleanup", async () => {
    const lifecycle = new ClassroomLifecycleService();
    let continueCleanup: (() => void) | undefined;
    const waitForCleanup = new Promise<void>((resolve) => {
      continueCleanup = resolve;
    });
    lifecycle.register({
      id: "scene.1",
      kind: "scene",
      dispose: () => waitForCleanup,
    });
    expect(() =>
      lifecycle.register({ id: "scene.1", kind: "scene", dispose: vi.fn() }),
    ).toThrow("already registered");

    const cleanup = lifecycle.cleanup("guidance");
    expect(lifecycle.getSnapshot().cleaning).toBe(true);
    expect(() =>
      lifecycle.register({ id: "timer.1", kind: "timer", dispose: vi.fn() }),
    ).toThrow("during cleanup");
    continueCleanup?.();
    await cleanup;
  });
});
