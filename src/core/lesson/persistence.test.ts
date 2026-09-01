import { describe, expect, it } from "vitest";

import { createActiveLessonState } from "./state";
import { LessonPersistence, type LessonStorage } from "./persistence";

describe("LessonPersistence", () => {
  it("restores a bounded active lesson without persisting a connection", () => {
    const storage = createMemoryStorage();
    const persistence = new LessonPersistence(storage);
    const state = createActiveLessonState(
      {
        id: "lesson.persistence",
        title: "Persistence",
        objective: "Resume a real lesson after refresh.",
      },
      [
        {
          id: "step.persistence",
          title: "Restore the plan",
          objective: "Keep the provider-neutral step.",
          criteria: [],
          hints: [],
        },
      ],
    );

    expect(persistence.save(state)).toBe(true);
    expect(persistence.load()).toEqual(
      expect.objectContaining({
        status: "active",
        lesson: state.lesson,
        plan: expect.objectContaining({ activeStepId: "step.persistence" }),
      }),
    );
    expect(storage.getItem("webmcp-connected")).toBeNull();
  });

  it("rejects invalid data and does not save an idle lesson", () => {
    const storage = createMemoryStorage();
    const persistence = new LessonPersistence(storage);
    storage.setItem("lessonique.lesson.v1", "not-json");
    expect(persistence.load()).toBeUndefined();
    expect(
      persistence.save({
        status: "idle",
        plan: { steps: [], revision: 0 },
        progress: {
          totalSteps: 0,
          completedSteps: 0,
          failedSteps: 0,
          percentage: 0,
        },
        agent: { status: "idle" },
        activity: [],
        interactions: [],
        waits: [],
        revision: 0,
      }),
    ).toBe(false);
  });
});

function createMemoryStorage(): LessonStorage {
  const entries = new Map<string, string>();
  return {
    getItem: (key) => entries.get(key) ?? null,
    removeItem: (key) => {
      entries.delete(key);
    },
    setItem: (key, value) => {
      entries.set(key, value);
    },
  };
}
