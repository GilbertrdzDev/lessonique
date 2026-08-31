import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ScenePresentationStore } from "@/core/scene";

import { AssistantOverlayHost } from "./assistant-overlay-host";

describe("AssistantOverlayHost", () => {
  it("preserves visual guide structure, caption, hint, and semantic assistant state", () => {
    const store = new ScenePresentationStore();
    store.commit({
      sceneId: "scene.visual",
      beatId: "beat.visual",
      target: {
        resolverId: "target.surface-anchor",
        input: { anchorId: "anchor.learning-plan" },
      },
      targetSnapshot: {
        status: "resolved",
        geometry: { left: 100, top: 80, width: 220, height: 90 },
      },
      assistant: {
        stateId: "assistant.success",
        placementId: "placement.near-target",
        visible: true,
        status: "presenting",
        position: {
          left: 350,
          top: 90,
          docked: false,
          side: "right",
          facing: "left",
          companionOffsetLeft: 0,
          companionOffsetTop: 34,
        },
        reducedMotion: false,
      },
      effects: [
        { effectId: "effect.focus" },
        { effectId: "effect.spotlight" },
        { effectId: "effect.highlight" },
        { effectId: "effect.pointer" },
        { effectId: "effect.callout", input: { text: "Inspect this target." } },
      ],
      guide: {
        title: "Responsive navigation",
        body: "Keep this line.\nKeep the next line.",
        supportingItems: ["First supporting item", "Second supporting item"],
      },
      caption: "Visible caption",
      hint: "Use a semantic element.",
      paused: false,
    });

    const html = renderToStaticMarkup(
      <AssistantOverlayHost presentationStore={store} />,
    );

    expect(html).toContain("Lessonique companion: success");
    expect(html).toContain('data-assistant-state="assistant.success"');
    expect(html).toContain('data-assistant-side="right"');
    expect(html).toContain('data-assistant-facing="left"');
    expect(html).toContain("Responsive navigation");
    expect(html).toContain("Keep this line.\nKeep the next line.");
    expect(html.indexOf("First supporting item")).toBeLessThan(
      html.indexOf("Second supporting item"),
    );
    expect(html).toContain("Visible caption");
    expect(html).toContain("Use a semantic element.");
    expect(html).toContain('data-guidance-effect="spotlight"');
    expect(html).toContain('data-guidance-effect="focus"');
    expect(html).toContain('data-guidance-effect="highlight"');
    expect(html).toContain('data-guidance-effect="point"');
    expect(html).toContain("Inspect this target.");
    expect(html).not.toMatch(/audio|speech|voice/iu);
  });

  it("reflows the guide and points with the target-facing arm on the left side", () => {
    const store = new ScenePresentationStore();
    const current = store.getSnapshot();
    store.commit({
      ...current,
      targetSnapshot: {
        status: "resolved",
        geometry: { left: 960, top: 180, width: 160, height: 48 },
      },
      assistant: {
        ...current.assistant,
        stateId: "assistant.pointing",
        visible: true,
        position: {
          left: 516,
          top: 148,
          docked: false,
          side: "left",
          facing: "right",
          companionOffsetLeft: 316,
          companionOffsetTop: 34,
        },
      },
      effects: [{ effectId: "effect.pointer" }],
      guide: { body: "The guide stays outside the active target." },
    });

    const html = renderToStaticMarkup(
      <AssistantOverlayHost presentationStore={store} />,
    );

    expect(html).toContain('data-assistant-side="left"');
    expect(html).toContain('data-assistant-facing="right"');
    expect(html).toContain('data-pointing-arm="right"');
    expect(html).toContain("flex-row-reverse");
    expect(html).toContain("companion-arm-left");
    expect(html).toContain("companion-arm-right");
  });

  it("renders untrusted guidance as inert text instead of HTML", () => {
    const store = new ScenePresentationStore();
    const current = store.getSnapshot();
    store.commit({
      ...current,
      effects: [
        {
          effectId: "effect.callout",
          input: { text: '<img src=x onerror="globalThis.compromised=true">' },
        },
      ],
      guide: {
        title: "Untrusted guide",
        body: "<script>globalThis.compromised=true</script>",
        supportingItems: ["<strong>Keep this literal</strong>"],
      },
      caption: "<iframe srcdoc=unsafe></iframe>",
      hint: "<svg onload=unsafe></svg>",
    });

    const html = renderToStaticMarkup(
      <AssistantOverlayHost presentationStore={store} />,
    );

    expect(html).toContain("&lt;script&gt;globalThis.compromised=true&lt;/script&gt;");
    expect(html).toContain("&lt;strong&gt;Keep this literal&lt;/strong&gt;");
    expect(html).toContain("&lt;img src=x onerror=&quot;");
    expect(html).toContain("&lt;iframe srcdoc=unsafe&gt;&lt;/iframe&gt;");
    expect(html).toContain("&lt;svg onload=unsafe&gt;&lt;/svg&gt;");
    expect(html).not.toMatch(/<(?:script|strong|img|iframe|svg)\b/iu);
  });

  it.each([
    "assistant.idle",
    "assistant.explaining",
    "assistant.pointing",
    "assistant.thinking",
    "assistant.success",
    "assistant.warning",
  ])("renders the accessible %s state", (stateId) => {
    const store = new ScenePresentationStore();
    const current = store.getSnapshot();
    store.commit({
      ...current,
      assistant: {
        ...current.assistant,
        stateId,
        visible: true,
      },
    });

    const html = renderToStaticMarkup(
      <AssistantOverlayHost presentationStore={store} />,
    );

    expect(html).toContain(`data-assistant-state="${stateId}"`);
    expect(html).toContain(`Lessonique companion: ${stateId.replace("assistant.", "")}`);
  });

  it("keeps the full visual meaning in reduced-motion mode", () => {
    const store = new ScenePresentationStore();
    const current = store.getSnapshot();
    store.commit({
      ...current,
      assistant: {
        ...current.assistant,
        stateId: "assistant.explaining",
        visible: true,
        reducedMotion: true,
      },
      guide: {
        title: "Reduced motion guide",
        body: "The explanation remains visible without animated travel.",
        supportingItems: ["Focus remains available."],
      },
      caption: "Motion is optional; meaning is not.",
    });

    const html = renderToStaticMarkup(
      <AssistantOverlayHost presentationStore={store} />,
    );

    expect(html).toContain('data-reduced-motion="true"');
    expect(html).toContain("Reduced motion guide");
    expect(html).toContain("Focus remains available.");
    expect(html).toContain("Motion is optional; meaning is not.");
  });

  it("keeps structured guidance visible when the target and assistant renderer are unavailable", () => {
    const store = new ScenePresentationStore();
    const current = store.getSnapshot();
    store.commit({
      ...current,
      targetSnapshot: { status: "lost" },
      assistant: {
        ...current.assistant,
        visible: false,
        reducedMotion: true,
      },
      effects: [
        { effectId: "effect.focus" },
        { effectId: "effect.pointer" },
        { effectId: "effect.callout", input: { text: "Fallback callout" } },
      ],
      guide: {
        title: "Fallback guide",
        body: "The lesson remains readable without a rendered companion.",
        supportingItems: ["Structured support remains available."],
      },
      caption: "Visible fallback caption",
      hint: "Visible fallback hint",
    });

    const html = renderToStaticMarkup(
      <AssistantOverlayHost presentationStore={store} />,
    );

    expect(html).toContain('aria-label="Teaching guide"');
    expect(html).toContain("Fallback guide");
    expect(html).toContain("Structured support remains available.");
    expect(html).toContain("Fallback callout");
    expect(html).toContain("Visible fallback caption");
    expect(html).toContain("Visible fallback hint");
    expect(html).not.toContain("Lessonique companion:");
    expect(html).not.toContain("data-guidance-effect=");
  });
});
