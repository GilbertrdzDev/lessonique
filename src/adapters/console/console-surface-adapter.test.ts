import { describe, expect, it, vi } from "vitest";

import { ConsoleSurfaceAdapter } from "./console-surface-adapter";

describe("ConsoleSurfaceAdapter", () => {
  it("resolves registered console entries by semantic ID", async () => {
    const adapter = new ConsoleSurfaceAdapter(
      "console",
      "target.console-entry",
    );
    adapter.registerEntryElement(
      "console.1.ready",
      {
        isConnected: true,
        scrollIntoView: vi.fn(),
        getBoundingClientRect: () => ({
          left: 15,
          top: 30,
          width: 400,
          height: 24,
        }),
      } as unknown as HTMLElement,
    );

    const handle = await adapter.resolveTarget(
      {
        resolverId: "target.console-entry",
        input: { entryId: "console.1.ready" },
      },
      new AbortController().signal,
    );

    expect(handle.getSnapshot()).toEqual({
      status: "resolved",
      geometry: { left: 15, top: 30, width: 400, height: 24 },
    });
  });
});
