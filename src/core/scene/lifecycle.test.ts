import { describe, expect, it, vi } from "vitest";

import { ClassroomLifecycleService } from "@/core/lesson";

import { SceneLifecycleScope } from "./lifecycle";

describe("SceneLifecycleScope", () => {
  it("aborts and disposes every scoped resource in reverse order", async () => {
    const lifecycle = new ClassroomLifecycleService();
    const scope = new SceneLifecycleScope("scene.test", lifecycle);
    const order: string[] = [];
    scope.add({
      id: "guide",
      kind: "visual-guide",
      dispose: () => {
        order.push("guide");
      },
    });
    scope.add({
      id: "overlay",
      kind: "overlay",
      dispose: () => {
        order.push("overlay");
      },
    });
    const abort = vi.fn();
    scope.signal.addEventListener("abort", abort);

    await scope.dispose();
    await scope.dispose();

    expect(order).toEqual(["overlay", "guide"]);
    expect(abort).toHaveBeenCalledOnce();
    expect(lifecycle.getSnapshot().total).toBe(0);
  });
});
