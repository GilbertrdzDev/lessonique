import { describe, expect, it, vi } from "vitest";

import { WorkspaceStore } from "./store";

describe("WorkspaceStore", () => {
  it("starts in an idle provider-neutral state", () => {
    const store = new WorkspaceStore();

    expect(store.getSnapshot()).toEqual({
      status: "idle",
      languageIds: [],
      files: [],
      surfaces: [],
      consoleEntries: [],
      interactionEvents: [],
      runtime: { status: "idle", revision: 0 },
      environmentRevision: 0,
    });
  });

  it("stores generic provider IDs and emits one notification per commit", () => {
    const store = new WorkspaceStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.commit({
      ...store.getSnapshot(),
      status: "ready",
      profileId: "profile.fake",
      runtimeProviderId: "runtime.fake",
      languageIds: ["language.fake"],
      environmentRevision: 1,
      runtime: {
        providerId: "runtime.fake",
        status: "ready",
        revision: 1,
      },
    });

    expect(store.getSnapshot()).toEqual(
      expect.objectContaining({
        profileId: "profile.fake",
        runtimeProviderId: "runtime.fake",
        languageIds: ["language.fake"],
        environmentRevision: 1,
      }),
    );
    expect(listener).toHaveBeenCalledOnce();
  });

  it("clones committed collections before exposing state", () => {
    const store = new WorkspaceStore();
    const languageIds = ["language.fake"];

    store.commit({
      ...store.getSnapshot(),
      languageIds,
    });
    languageIds.push("language.changed-after-commit");

    expect(store.getSnapshot().languageIds).toEqual(["language.fake"]);
  });
});
