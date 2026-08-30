import { describe, expect, it, vi } from "vitest";

import { createP0ProviderPlatform } from "@/providers/p0";

import { InteractionAnchorAdapter } from "./interaction-anchor-adapter";

describe("InteractionAnchorAdapter", () => {
  it("resolves registered semantic anchors and reports loss without selectors", async () => {
    const registries = createP0ProviderPlatform();
    const adapter = new InteractionAnchorAdapter({
      resolverId: "target.surface-anchor",
      activationEventTypeId: "interaction.surface-activate",
      definitions: registries.interactionAnchors,
      getEnvironmentRevision: () => 1,
    });
    const element = createElement();
    adapter.registerElement("anchor.workspace-editor", element);

    const handle = await adapter.resolveTarget(
      {
        resolverId: "target.surface-anchor",
        input: { anchorId: "anchor.workspace-editor" },
      },
      new AbortController().signal,
    );

    expect(handle.getSnapshot()).toEqual({
      status: "resolved",
      geometry: { left: 10, top: 20, width: 300, height: 200 },
    });
    expect(() =>
      adapter.registerElement("anchor.unknown", element),
    ).toThrow(/does not contain/u);
  });
});

function createElement(): HTMLElement {
  return {
    isConnected: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    scrollIntoView: vi.fn(),
    getBoundingClientRect: () => ({
      left: 10,
      top: 20,
      width: 300,
      height: 200,
    }),
  } as unknown as HTMLElement;
}
