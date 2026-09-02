import { describe, expect, it } from "vitest";

import { createP0WorkspaceRuntime } from "./workspace-runtime";

describe("P0 workspace runtime", () => {
  it("renders the complete vanilla web surface contract", async () => {
    const runtime = createP0WorkspaceRuntime();

    await runtime.controller.activateProfile("profile.vanilla-web");

    const state = runtime.store.getSnapshot();
    expect(state.files.map(({ path }) => path)).toEqual([
      "index.html",
      "styles.css",
      "script.js",
    ]);
    expect(
      state.surfaces.filter(({ visible }) => visible).map(({ id }) => id),
    ).toEqual(["editor", "preview", "console", "plan", "activity"]);
  });

  it("switches to JavaScript console without reload or non-JavaScript files", async () => {
    const runtime = createP0WorkspaceRuntime();
    await runtime.controller.activateProfile("profile.vanilla-web");

    await runtime.controller.activateProfile("profile.javascript-console");

    const state = runtime.store.getSnapshot();
    expect(state.profileId).toBe("profile.javascript-console");
    expect(state.languageIds).toEqual(["language.javascript"]);
    expect(state.files).toEqual([
      expect.objectContaining({
        path: "script.js",
        languageId: "language.javascript",
      }),
    ]);
    expect(state.surfaces.find(({ id }) => id === "preview")).toBeUndefined();
    expect(
      state.surfaces.filter(({ visible }) => visible).map(({ id }) => id),
    ).toEqual(["editor", "console", "plan", "activity"]);
  });
});
