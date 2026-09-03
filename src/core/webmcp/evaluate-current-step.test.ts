import { describe, expect, it } from "vitest";

import { createP0WorkspaceRuntime } from "@/providers/p0";

import { createEarlyWebMCPToolRegistry } from "./mock-handlers";

describe("evaluate_current_step", () => {
  it("evaluates every declared criterion, records one attempt, and advances on a complete pass", async () => {
    const runtime = createP0WorkspaceRuntime();
    const registry = createRegistry(runtime);
    await registry.invoke(
      "create_guided_lesson",
      lessonInput([
        {
          id: "criterion.file",
          requirement: "Keep `index.html` in the workspace.",
          validatorId: "validator.file-exists",
          input: { filePath: "index.html" },
        },
        {
          id: "criterion.text",
          requirement: "Include `Lessonique` in `index.html`.",
          validatorId: "validator.text-exists",
          input: { filePath: "index.html", text: "Lessonique" },
        },
      ]),
    );
    const result = await registry.invoke("evaluate_current_step", {
      advanceOnPass: true,
      showFeedback: true,
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        status: "completed",
        data: expect.objectContaining({
          stepId: "step.1",
          outcome: "passed",
          passed: true,
          advanced: true,
          feedbackShown: true,
          activeStepId: "step.2",
          criteria: [
            expect.objectContaining({
              criterionId: "criterion.file",
              status: "passed",
              evidence: expect.any(Array),
            }),
            expect.objectContaining({
              criterionId: "criterion.text",
              status: "passed",
              evidence: expect.any(Array),
            }),
          ],
        }),
      }),
    );
    expect(result.data).not.toEqual(expect.objectContaining({ mock: true }));
    const state = runtime.lessonStore.getSnapshot();
    expect(state.plan.steps[0]).toEqual(
      expect.objectContaining({
        status: "completed",
        attempts: [expect.objectContaining({ outcome: "passed" })],
      }),
    );
    expect(state.agent.assistantIntent).toEqual(
      expect.objectContaining({
        stateId: "assistant.success",
        lessonStepId: "step.1",
      }),
    );
    expect(state.activity).toContainEqual(
      expect.objectContaining({
        typeId: "lesson.step-evaluated",
        outcome: "success",
      }),
    );
  });

  it("does not partially advance when any declared criterion fails", async () => {
    const runtime = createP0WorkspaceRuntime();
    const registry = createRegistry(runtime);
    await registry.invoke(
      "create_guided_lesson",
      lessonInput([
        {
          id: "criterion.file",
          requirement: "Keep `index.html` in the workspace.",
          validatorId: "validator.file-exists",
          input: { filePath: "index.html" },
        },
        {
          id: "criterion.missing",
          requirement: "Include the requested content in `index.html`.",
          validatorId: "validator.text-exists",
          input: { filePath: "index.html", text: "Missing content" },
        },
      ]),
    );
    const result = await registry.invoke("evaluate_current_step", {
      advanceOnPass: true,
    });

    expect(result.data).toEqual(
      expect.objectContaining({
        outcome: "failed",
        passed: false,
        advanced: false,
        activeStepId: "step.1",
        criteria: expect.arrayContaining([
          expect.objectContaining({
            criterionId: "criterion.missing",
            status: "failed",
          }),
        ]),
      }),
    );
    const state = runtime.lessonStore.getSnapshot();
    expect(state.plan.steps[0]).toEqual(
      expect.objectContaining({
        status: "active",
        attempts: [expect.objectContaining({ outcome: "failed" })],
      }),
    );
    expect(state.agent.assistantIntent?.stateId).toBe("assistant.warning");
  });

  it("keeps progress and feedback state unchanged unless explicitly requested", async () => {
    const runtime = createP0WorkspaceRuntime();
    const registry = createRegistry(runtime);
    await registry.invoke(
      "create_guided_lesson",
      lessonInput([
        {
          id: "criterion.file",
          requirement: "Keep `index.html` in the workspace.",
          validatorId: "validator.file-exists",
          input: { filePath: "index.html" },
        },
      ]),
    );
    const agentBeforeEvaluation = runtime.lessonStore.getSnapshot().agent;

    const result = await registry.invoke("evaluate_current_step", {
      showFeedback: false,
    });

    expect(result.data).toEqual(
      expect.objectContaining({
        passed: true,
        advanced: false,
        feedbackShown: false,
        activeStepId: "step.1",
      }),
    );
    const state = runtime.lessonStore.getSnapshot();
    expect(state.plan.steps[0]?.status).toBe("active");
    expect(state.agent).toEqual(agentBeforeEvaluation);
  });

  it("recognizes an equivalent JavaScript function solution through semantic criteria", async () => {
    const runtime = createP0WorkspaceRuntime();
    const registry = createRegistry(runtime);
    await registry.invoke("create_guided_lesson", {
      lessonId: "lesson.equivalent-solution",
      lessonMode: "practice",
      title: "Equivalent JavaScript solution",
      objective: "Validate function intent without matching exact source text.",
      environment: {
        profileId: "profile.javascript-console",
        activeFile: "index.js",
        activeSurfaceId: "editor",
      },
      files: [
        {
          path: "index.js",
          languageId: "language.javascript",
          content:
            'const favoriteColor = "green";\nconst describeFavorite = (color) => `I like ${color}.`;\nconsole.log(describeFavorite(favoriteColor));',
        },
      ],
      steps: [
        {
          id: "step.exercise",
          title: "Describe a favorite color",
          objective: "Create and call describeFavorite.",
          criteria: [
            {
              id: "criterion.function",
              requirement: "Define `describeFavorite`.",
              validatorId: "validator.javascript-function-exists",
              input: { filePath: "index.js", name: "describeFavorite" },
            },
            {
              id: "criterion.call",
              requirement: "Call `describeFavorite`.",
              validatorId: "validator.javascript-call-exists",
              input: { filePath: "index.js", calleeName: "describeFavorite" },
            },
          ],
        },
      ],
    });

    const result = await runtime.evaluateCurrentStep.evaluate(
      "step.exercise",
      { recordAttempt: false },
      new AbortController().signal,
    );

    expect(result).toEqual({
      passed: true,
      passedCriteria: 2,
      totalCriteria: 2,
    });
    expect(runtime.lessonStore.getSnapshot().plan.steps[0]?.attempts).toEqual([]);

    await runtime.controller.updateFileContent(
      "index.js",
      'const describeFavorite = (color) => `I like ${color}.`;',
    );
    const invalidated = await runtime.evaluateCurrentStep.evaluate(
      "step.exercise",
      { recordAttempt: false },
      new AbortController().signal,
    );

    expect(invalidated).toEqual({
      passed: false,
      passedCriteria: 1,
      totalCriteria: 2,
      failedRequirements: ["Call `describeFavorite`."],
    });
  });

  it("rejects missing steps and steps without criteria before recording attempts", async () => {
    const runtime = createP0WorkspaceRuntime();
    const registry = createRegistry(runtime);
    await registry.invoke("create_guided_lesson", lessonInput([]));

    const missing = await registry.invoke("evaluate_current_step", {
      stepId: "step.missing",
    });
    const noCriteria = await registry.invoke("evaluate_current_step", {});

    expect(missing).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: "invalid_lesson_step" }),
      }),
    );
    expect(noCriteria).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: "no_declared_criteria" }),
      }),
    );
    expect(runtime.lessonStore.getSnapshot().plan.steps[0]?.attempts).toEqual([]);
  });
});

function createRegistry(runtime: ReturnType<typeof createP0WorkspaceRuntime>) {
  return createEarlyWebMCPToolRegistry(runtime.registries, {
    workspaceController: runtime.controller,
    createGuidedLesson: runtime.createGuidedLesson,
    resetClassroom: runtime.resetClassroom,
    lessonState: runtime.lessonStore,
    lessonStore: runtime.lessonStore,
    workspaceState: runtime.store,
    classroomLifecycle: runtime.classroomLifecycle,
    codeIntelligence: runtime.codeIntelligence.service,
    diagnostics: runtime.codeIntelligence.diagnostics,
    validationResults: runtime.validation.results,
    sceneRunner: runtime.scene.runner,
    sceneState: runtime.scene.store,
    validationEngine: runtime.validation.engine,
    assistantIntents: runtime.assistantIntents,
  });
}

function lessonInput(
  criteria: Array<{
    id: string;
    requirement: string;
    validatorId: string;
    input: Record<string, string>;
  }>,
) {
  return {
    lessonId: "lesson.evaluation",
    lessonMode: "practice" as const,
    title: "Evaluation lesson",
    objective: "Evaluate declared criteria only.",
    environment: {
      profileId: "profile.vanilla-web",
      activeFile: "index.html",
      activeSurfaceId: "editor",
    },
    files: [
      {
        path: "index.html",
        languageId: "language.html",
        content: "<main>Lessonique</main>",
      },
    ],
    steps: [
      {
        id: "step.1",
        title: "First step",
        objective: "Meet every declared criterion.",
        criteria,
      },
      {
        id: "step.2",
        title: "Second step",
        objective: "Continue after a complete pass.",
      },
    ],
  };
}
