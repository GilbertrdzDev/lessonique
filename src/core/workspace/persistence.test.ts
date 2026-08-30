import { describe, expect, it } from "vitest";

import { createP0WorkspaceRuntime } from "@/providers/p0";

import {
  WorkspacePersistence,
  type WorkspaceStorage,
} from "./persistence";

describe("WorkspacePersistence", () => {
  it("round-trips provider-neutral workspace data without transient events", async () => {
    const storage = createStorage();
    const persistence = new WorkspacePersistence(storage);
    const runtime = createP0WorkspaceRuntime();
    await runtime.controller.activateProfile("profile.javascript-console");
    runtime.controller.recordInteraction({
      id: "interaction-1",
      typeId: "interaction.editor-change",
      environmentRevision: 1,
      occurredAt: "2026-08-30T00:00:00.000Z",
    });

    expect(persistence.save(runtime.store.getSnapshot())).toBe(true);
    const restored = persistence.load();

    expect(restored).toEqual(
      expect.objectContaining({
        profileId: "profile.javascript-console",
        runtimeProviderId: "runtime.sandpack-vanilla",
        languageIds: ["language.javascript"],
        activeFilePath: "script.js",
        interactionEvents: [],
        consoleEntries: [],
      }),
    );
  });

  it("ignores corrupted and future-version data", () => {
    const storage = createStorage();
    const persistence = new WorkspacePersistence(storage);
    storage.setItem("lessonique.workspace.v1", "not-json");
    expect(persistence.load()).toBeUndefined();

    storage.setItem(
      "lessonique.workspace.v1",
      JSON.stringify({ version: 2, profileId: "profile.future" }),
    );
    expect(persistence.load()).toBeUndefined();
  });

  it("restores only after provider validation succeeds", async () => {
    const storage = createStorage();
    const persistence = new WorkspacePersistence(storage);
    const runtime = createP0WorkspaceRuntime();
    await runtime.controller.activateProfile("profile.vanilla-web");
    persistence.save(runtime.store.getSnapshot());
    const persisted = persistence.load();
    if (!persisted) {
      throw new Error("Expected persisted workspace state.");
    }
    persisted.files = [
      {
        path: "unsafe.php",
        languageId: "language.html",
        content: "",
        visible: true,
      },
    ];

    await expect(runtime.controller.restore(persisted)).rejects.toThrow(
      /does not match language/u,
    );
  });
});

function createStorage(): WorkspaceStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}
