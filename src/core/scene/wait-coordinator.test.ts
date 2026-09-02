import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createActiveLessonState } from "@/core/lesson";
import { createP0WorkspaceRuntime } from "@/providers/p0";

import { WaitCoordinator } from "./wait-coordinator";

describe("WaitCoordinator", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("resolves registered validation locally and records evidence-backed success", async () => {
    const runtime = await createRuntime("validator.file-exists", {
      filePath: "index.html",
    });
    const coordinator = createCoordinator(runtime);

    const result = await coordinator.waitFor(
      "wait.validation",
      {
        kind: "validation",
        criterionId: "criterion.1",
        lessonStepId: "step.1",
        timeoutMs: 100,
      },
      new AbortController().signal,
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: "satisfied",
        outcome: "success",
        validation: expect.objectContaining({ status: "passed" }),
      }),
    );
    expect(runtime.lessonStore.getSnapshot().plan.steps[0]?.attempts).toEqual([
      expect.objectContaining({ outcome: "passed" }),
    ]);
  });

  it("reveals a bounded local hint when validation times out", async () => {
    const runtime = await createRuntime("validator.text-exists", {
      filePath: "index.html",
      text: "missing content",
    });
    const coordinator = createCoordinator(runtime);
    const waiting = coordinator.waitFor(
      "wait.timeout",
      {
        kind: "validation",
        criterionId: "criterion.1",
        lessonStepId: "step.1",
        timeoutMs: 25,
      },
      new AbortController().signal,
    );

    await vi.advanceTimersByTimeAsync(26);

    await expect(waiting).resolves.toEqual(
      expect.objectContaining({
        status: "timed-out",
        outcome: "warning",
        hint: "Check the current workspace file.",
      }),
    );
    expect(runtime.lessonStore.getSnapshot().plan.steps[0]).toEqual(
      expect.objectContaining({
        revealedHintCount: 1,
        attempts: [expect.objectContaining({ outcome: "failed" })],
      }),
    );
  });

  it("uses normalized interaction outcomes for local success and warning reactions", async () => {
    const runtime = await createRuntime("validator.file-exists", {
      filePath: "index.html",
    });
    const coordinator = createCoordinator(runtime);
    const waiting = coordinator.waitFor(
      "wait.interaction",
      {
        kind: "interaction",
        eventTypeId: "interaction.preview-click",
        lessonStepId: "step.1",
        timeoutMs: 100,
      },
      new AbortController().signal,
    );

    runtime.interactionTracker.record({
      id: "interaction.preview.failure",
      typeId: "interaction.preview-click",
      lessonStepId: "step.1",
      surfaceId: "preview",
      environmentRevision: runtime.store.getSnapshot().environmentRevision,
      occurredAt: "2026-08-30T12:00:00.000Z",
      summary: "The preview action failed its educational outcome.",
      outcome: "failure",
    });

    await expect(waiting).resolves.toEqual(
      expect.objectContaining({
        status: "satisfied",
        outcome: "warning",
        eventId: "interaction.preview.failure",
        hint: "Check the current workspace file.",
      }),
    );
  });
});

async function createRuntime(
  validatorId: string,
  input: Record<string, string>,
) {
  const runtime = createP0WorkspaceRuntime();
  await runtime.controller.activateProfile("profile.vanilla-web");
  runtime.lessonStore.commit(
    createActiveLessonState(
      {
        id: "lesson.waits",
        title: "Local waits",
        objective: "Resolve learner conditions locally.",
      },
      [
        {
          id: "step.1",
          title: "Step 1",
          objective: "Meet the declared condition.",
          criteria: [{ id: "criterion.1", validatorId, input }],
          hints: ["Check the current workspace file."],
        },
      ],
    ),
  );
  return runtime;
}

function createCoordinator(runtime: ReturnType<typeof createP0WorkspaceRuntime>) {
  return new WaitCoordinator({
    interactions: runtime.interactionTracker,
    validation: runtime.validation.engine,
    lesson: runtime.lessonStore,
  });
}
