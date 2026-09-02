import { describe, expect, it, vi } from "vitest";

import {
  GuideBuildService,
  GuideBuildTransitionError,
} from "./guide-build-state";

describe("GuideBuildService", () => {
  it("advances the three public stages one step at a time", () => {
    const service = new GuideBuildService();

    expect(
      service.setStatus({
        status: "building",
        stage: "understanding-goal",
      }),
    ).toMatchObject({ status: "building", stage: "understanding-goal", revision: 1 });
    expect(
      service.setStatus({
        status: "building",
        stage: "preparing-lesson",
      }),
    ).toMatchObject({ status: "building", stage: "preparing-lesson", revision: 2 });
    expect(
      service.setStatus({
        status: "building",
        stage: "setting-up-classroom",
      }),
    ).toMatchObject({ status: "building", stage: "setting-up-classroom", revision: 3 });
  });

  it("keeps repeated updates idempotent", () => {
    const service = new GuideBuildService();
    const listener = vi.fn();
    service.store.subscribe(listener);

    const first = service.setStatus({
      status: "building",
      stage: "understanding-goal",
    });
    const second = service.setStatus({
      status: "building",
      stage: "understanding-goal",
    });

    expect(second).toBe(first);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("rejects skipped and backward public stages", () => {
    const service = new GuideBuildService();

    expect(() =>
      service.setStatus({
        status: "building",
        stage: "preparing-lesson",
      }),
    ).toThrow(GuideBuildTransitionError);
    service.setStatus({ status: "building", stage: "understanding-goal" });
    service.setStatus({ status: "building", stage: "preparing-lesson" });
    expect(() =>
      service.setStatus({
        status: "building",
        stage: "understanding-goal",
      }),
    ).toThrow("one step at a time");
  });

  it("lets the real classroom transaction select setup and completion", () => {
    const service = new GuideBuildService();

    expect(service.beginClassroomSetup()).toMatchObject({
      status: "building",
      stage: "setting-up-classroom",
    });
    expect(service.complete()).toMatchObject({
      status: "completed",
      stage: "setting-up-classroom",
    });
    expect(service.setStatus({ status: "completed" })).toBe(
      service.store.getSnapshot(),
    );
  });

  it("rejects an agent completion before the classroom transaction succeeds", () => {
    const service = new GuideBuildService();
    service.setStatus({ status: "building", stage: "understanding-goal" });

    expect(() => service.setStatus({ status: "completed" })).toThrow(
      "successful classroom transaction",
    );
  });

  it("records errors and resets without retaining stale fields", () => {
    const service = new GuideBuildService();
    service.setStatus({ status: "building", stage: "understanding-goal" });

    expect(service.fail("The connection was interrupted.")).toMatchObject({
      status: "error",
      stage: "understanding-goal",
      message: "The connection was interrupted.",
    });
    expect(service.reset()).toEqual({ status: "idle", revision: 3 });
  });
});
