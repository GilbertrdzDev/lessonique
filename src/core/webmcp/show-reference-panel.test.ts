import { describe, expect, it } from "vitest";

import { createP0WorkspaceRuntime } from "@/providers/p0";

import { createEarlyWebMCPToolRegistry } from "./mock-handlers";

describe("ShowReferencePanelService", () => {
  it("opens, replaces, and idempotently preserves one structured reference", async () => {
    const runtime = createP0WorkspaceRuntime();
    await runtime.controller.activateProfile("profile.vanilla-web");
    const registry = createRegistry(runtime);

    const opened = await registry.invoke("show_reference_panel", {
      referenceId: "reference.event-listener",
      title: "Event listener pattern",
      content: "Keep behavior local and inspect the emitted result.",
      snippets: [
        {
          languageId: "language.javascript",
          code: "button.addEventListener('click', handleClick);",
        },
      ],
      focus: true,
    });

    expect(opened).toEqual(
      expect.objectContaining({
        ok: true,
        status: "completed",
        data: expect.objectContaining({
          referenceId: "reference.event-listener",
          surfaceId: "reference",
          visible: true,
          focused: true,
          replaced: false,
          unchanged: false,
          snippetLanguageIds: ["language.javascript"],
        }),
      }),
    );
    expect(
      runtime.store.getSnapshot().surfaces.find(({ id }) => id === "reference"),
    ).toEqual(expect.objectContaining({ visible: true }));
    expect(runtime.store.getSnapshot().activeSurfaceId).toBe("reference");

    const replaced = await registry.invoke("show_reference_panel", {
      referenceId: "reference.event-listener",
      title: "Updated event listener pattern",
      content: "The repeated ID replaces the existing reference.",
    });
    const replacementRevision = runtime.referencePanels.getSnapshot().revision;
    expect(replaced).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({ replaced: true, unchanged: false }),
      }),
    );
    expect(runtime.referencePanels.getSnapshot().active).toEqual(
      expect.objectContaining({
        referenceId: "reference.event-listener",
        title: "Updated event listener pattern",
        snippets: [],
      }),
    );

    const repeated = await registry.invoke("show_reference_panel", {
      referenceId: "reference.event-listener",
      title: "Updated event listener pattern",
      content: "The repeated ID replaces the existing reference.",
    });
    expect(repeated).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({ replaced: true, unchanged: true }),
      }),
    );
    expect(runtime.referencePanels.getSnapshot().revision).toBe(
      replacementRevision,
    );
    expect(runtime.classroomLifecycle.getSnapshot().counts["visual-guide"]).toBe(
      1,
    );
  });

  it("retains content while configuration hides the surface and clears it on guidance cleanup", async () => {
    const runtime = createP0WorkspaceRuntime();
    await runtime.controller.activateProfile("profile.vanilla-web");
    const registry = createRegistry(runtime);
    await registry.invoke("show_reference_panel", {
      referenceId: "reference.hidden",
      title: "Hidden reference",
      content: "The content remains available while its surface is hidden.",
    });

    const hidden = await registry.invoke("configure_learning_environment", {
      surfaces: [{ id: "reference", visible: false }],
    });
    expect(hidden.ok).toBe(true);
    expect(
      runtime.store.getSnapshot().surfaces.find(({ id }) => id === "reference"),
    ).toEqual(expect.objectContaining({ visible: false }));
    expect(runtime.referencePanels.getSnapshot().active?.referenceId).toBe(
      "reference.hidden",
    );

    await runtime.classroomLifecycle.cleanup("guidance", "reset");
    expect(runtime.referencePanels.getSnapshot().active).toBeUndefined();
    expect(runtime.classroomLifecycle.getSnapshot().counts["visual-guide"]).toBe(
      0,
    );
  });

  it("rejects incompatible surfaces and languages without mutation", async () => {
    const runtime = createP0WorkspaceRuntime();
    await runtime.controller.activateProfile("profile.vanilla-web");
    const registry = createRegistry(runtime);
    const workspaceBefore = runtime.store.getSnapshot();
    const referenceBefore = runtime.referencePanels.getSnapshot();

    const invalidSurface = await registry.invoke("show_reference_panel", {
      referenceId: "reference.invalid",
      title: "Invalid surface",
      content: "This must not be shown.",
      surfaceId: "preview",
    });
    expect(invalidSurface).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({
          code: "unsupported_reference_surface",
          supportedAlternatives: ["reference"],
        }),
      }),
    );

    const invalidLanguage = await registry.invoke("show_reference_panel", {
      referenceId: "reference.invalid-language",
      title: "Invalid language",
      content: "This must not be shown.",
      snippets: [{ languageId: "language.python", code: "print('later')" }],
    });
    expect(invalidLanguage).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({
          code: "unsupported_capability",
        }),
      }),
    );
    expect(runtime.store.getSnapshot()).toBe(workspaceBefore);
    expect(runtime.referencePanels.getSnapshot()).toBe(referenceBefore);
  });
});

function createRegistry(runtime: ReturnType<typeof createP0WorkspaceRuntime>) {
  return createEarlyWebMCPToolRegistry(runtime.registries, {
    workspaceController: runtime.controller,
    classroomLifecycle: runtime.classroomLifecycle,
    referencePanels: runtime.referencePanels,
    referenceSurfaceModeId: runtime.referenceSurfaceModeId,
  });
}
