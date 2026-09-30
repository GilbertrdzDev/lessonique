import { describe, expect, it, vi } from "vitest";

import { clearClassroomData } from "./clear-classroom-data";

describe("clear classroom data", () => {
  it("resets all classroom resources before removing only classroom persistence", async () => {
    const operations: string[] = [];
    const reset = { execute: vi.fn(async () => { operations.push("reset"); }) };
    const local = { removeItem: (key: string) => { operations.push(key); } };
    const session = { removeItem: (key: string) => { operations.push(key); } };
    await clearClassroomData(reset, () => local, () => session);
    expect(reset.execute).toHaveBeenCalledWith({ scope: "all" });
    expect(operations).toEqual(["reset", "lessonique.workspace.v1", "lessonique.lesson.v1"]);
  });

  it("reports a reset failure without deleting persisted recovery data", async () => {
    const removeItem = vi.fn();
    await expect(clearClassroomData({ execute: async () => { throw new Error("reset failed"); } }, () => ({ removeItem }), () => ({ removeItem })))
      .rejects.toThrow("reset failed");
    expect(removeItem).not.toHaveBeenCalled();
  });

  it("resets memory and independently clears session data when local storage is blocked", async () => {
    const reset = { execute: vi.fn(async () => undefined) };
    const removeItem = vi.fn();
    await expect(clearClassroomData(reset, () => { throw new Error("blocked"); }, () => ({ removeItem })))
      .rejects.toThrow("The active classroom was reset");
    expect(reset.execute).toHaveBeenCalledWith({ scope: "all" });
    expect(removeItem).toHaveBeenCalledWith("lessonique.lesson.v1");
  });
});
