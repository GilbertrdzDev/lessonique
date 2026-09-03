import { describe, expect, it } from "vitest";

import { createActiveLessonState } from "@/core/lesson";
import { createP0WorkspaceRuntime } from "@/providers/p0";

import { createEarlyWebMCPToolRegistry } from "./mock-handlers";

describe("UpdateLessonPlanService", () => {
  it("updates the active plan through the real registry without changing workspace files", async () => {
    const runtime = await createRuntimeWithLesson();
    const registry = createRegistry(runtime);
    const workspaceBefore = runtime.store.getSnapshot();

    const result = await registry.invoke("update_lesson_plan", {
      operations: [
        {
          type: "insert_step",
          afterStepId: "step.initial",
          step: {
            id: "step.inserted",
            title: "Inspect the result",
            objective: "Confirm the registered behavior.",
            criteria: [
              {
                id: "criterion.inserted",
                requirement: "Keep `lessonReady` in `script.js`.",
                validatorId: "validator.text-exists",
                input: { filePath: "script.js", text: "lessonReady" },
              },
            ],
            hints: ["Inspect the JavaScript workspace file."],
          },
        },
        {
          type: "set_active_step",
          stepId: "step.inserted",
        },
        {
          type: "set_agent_message",
          message: "The learning path now includes verification.",
        },
      ],
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        status: "completed",
        data: expect.objectContaining({
          activeStepId: "step.inserted",
          agentMessage: "The learning path now includes verification.",
          steps: expect.arrayContaining([
            expect.objectContaining({
              id: "step.inserted",
              status: "active",
              criterionIds: ["criterion.inserted"],
            }),
          ]),
          evidence: expect.objectContaining({
            environmentRevision: workspaceBefore.environmentRevision,
          }),
        }),
      }),
    );
    expect(result.data).not.toEqual(expect.objectContaining({ mock: true }));
    expect(runtime.store.getSnapshot()).toEqual(workspaceBefore);
  });

  it("rejects an invalid batch or validator input without partial lesson mutation", async () => {
    const runtime = await createRuntimeWithLesson();
    const registry = createRegistry(runtime);
    const before = runtime.lessonStore.getSnapshot();

    const invalidBatch = await registry.invoke("update_lesson_plan", {
      operations: [
        {
          type: "set_agent_message",
          message: "This must not be committed.",
        },
        { type: "remove_step", stepId: "step.missing" },
      ],
    });
    expect(invalidBatch).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({
          code: "invalid_lesson_plan_update",
          recoverable: true,
        }),
      }),
    );
    expect(runtime.lessonStore.getSnapshot()).toBe(before);

    const invalidValidator = await registry.invoke("update_lesson_plan", {
      operations: [
        {
          type: "update_step",
          stepId: "step.initial",
          patch: {
            criteria: [
              {
                id: "criterion.invalid",
                requirement: "Keep the required text in `script.js`.",
                validatorId: "validator.text-exists",
                input: { filePath: "script.js", unexpected: true },
              },
            ],
          },
        },
      ],
    });
    expect(invalidValidator).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({
          code: "invalid_validator_input",
        }),
      }),
    );
    expect(runtime.lessonStore.getSnapshot()).toBe(before);
  });

  it("requires an active lesson before adapting a plan", async () => {
    const runtime = createP0WorkspaceRuntime();
    await runtime.controller.activateProfile("profile.vanilla-web");
    const result = await createRegistry(runtime).invoke("update_lesson_plan", {
      operations: [
        { type: "set_agent_message", message: "No active lesson." },
      ],
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({
          code: "no_active_lesson",
          supportedAlternatives: ["create_guided_lesson"],
        }),
      }),
    );
  });
});

async function createRuntimeWithLesson() {
  const runtime = createP0WorkspaceRuntime();
  await runtime.controller.activateProfile("profile.vanilla-web");
  runtime.lessonStore.commit(
    createActiveLessonState(
      {
        id: "lesson.plan-fixture",
        title: "Plan fixture",
        objective: "Exercise plan updates.",
      },
      [
        {
          id: "step.initial",
          title: "Create the value",
          objective: "Define the lesson value.",
          criteria: [],
          hints: [],
        },
      ],
    ),
  );
  return runtime;
}

function createRegistry(runtime: ReturnType<typeof createP0WorkspaceRuntime>) {
  return createEarlyWebMCPToolRegistry(runtime.registries, {
    lessonStore: runtime.lessonStore,
    workspaceState: runtime.store,
  });
}
