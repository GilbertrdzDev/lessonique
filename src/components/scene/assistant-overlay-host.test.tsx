import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ScenePresentationStore } from "@/core/scene";

import {
  AssistantOverlayHost,
  LessoniqueCompanion,
} from "./assistant-overlay-host";

describe("AssistantOverlayHost", () => {
  it("preserves visual guide structure, caption, hint, and semantic assistant state", () => {
    const store = new ScenePresentationStore();
    store.commit({
      generation: 1,
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
          guideOffsetLeft: 128,
          guideOffsetTop: 0,
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
      phase: "teaching",
      navigation: {
        enabled: false,
        current: 1,
        total: 1,
        canGoPrevious: false,
        canGoNext: false,
        nextBlocked: false,
        transitioning: false,
      },
      paused: false,
      visibility: "visible",
    });

    const html = renderToStaticMarkup(
      <AssistantOverlayHost presentationStore={store} />,
    );

    expect(html).toContain("Lessonique companion: success");
    expect(html).toContain('data-assistant-state="assistant.success"');
    expect(html).toContain('data-companion-visual-state="success"');
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
    expect(html).not.toContain('data-guidance-effect="point"');
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
          guideOffsetLeft: 0,
          guideOffsetTop: 0,
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
    expect(html).toContain('data-companion-visual-state="guiding"');
    expect(html).toContain('data-companion-asset="normal"');
    expect(html).toContain("lessonique-guide-presentation");
    expect(html).toContain("lessonique-companion-normal.png");
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

  it("keeps the same companion identity while rendering WebMCP incompatibility", () => {
    const html = renderToStaticMarkup(
      <LessoniqueCompanion
        facing="right"
        paused={false}
        stateId="assistant.warning"
        status="unsupported"
        visualState="incompatible"
      />,
    );

    expect(html).toContain('data-companion-visual-state="incompatible"');
    expect(html).toContain('data-companion-asset="incompatible"');
    expect(html).toContain("lessonique-companion-incompatible.png");
    [
      "companion-ground-shadow",
      "companion-hover-ring-upper",
      "companion-hover-ring-lower",
      "companion-hover-spark",
      "companion-limb-left",
      "companion-limb-right",
      "body-glitch-slice-a",
      "body-glitch-slice-b",
      "body-glitch-slice-c",
      "companion-eye-glimmer-left",
      "companion-eye-glimmer-right",
      "interference-a",
      "interference-b",
      "interference-c",
      "interference-d",
      "companion-signal-fragment",
    ].forEach((className) => expect(html).toContain(className));
    expect(html).not.toContain("Connected through WebMCP");
  });

  it("renders local Previous and Next navigation for a manual micro-step scene", () => {
    const store = new ScenePresentationStore();
    const current = store.getSnapshot();
    store.commit({
      ...current,
      phase: "teaching",
      navigation: {
        enabled: true,
        current: 2,
        total: 4,
        canGoPrevious: true,
        canGoNext: true,
        nextBlocked: false,
        transitioning: false,
      },
      guide: {
        title: "Identifier",
        body: "This micro-step explains one token.",
      },
    });

    const html = renderToStaticMarkup(
      <AssistantOverlayHost presentationStore={store} />,
    );

    expect(html).toContain('data-slot="scene-navigation"');
    expect(html).toContain("Previous");
    expect(html).toContain("Step 2 of 4");
    expect(html).toContain("Next");
  });

  it("renders a compact interaction card with forward navigation blocked", () => {
    const store = new ScenePresentationStore();
    const current = store.getSnapshot();
    store.commit({
      ...current,
      phase: "interaction",
      navigation: {
        enabled: true,
        current: 3,
        total: 4,
        canGoPrevious: true,
        canGoNext: true,
        nextBlocked: true,
        transitioning: false,
      },
      guide: {
        title: "Your turn",
        body: "Create courseName using const.",
      },
    });

    const html = renderToStaticMarkup(
      <AssistantOverlayHost presentationStore={store} />,
    );

    expect(html).toContain('data-scene-phase="interaction"');
    expect(html).toContain("max-w-72");
    expect(html).toContain("Complete the required interaction first.");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Next<\/button>/u);
  });

  it("uses the focusing treatment without creating a second character renderer", () => {
    const store = new ScenePresentationStore();
    const current = store.getSnapshot();
    store.commit({
      ...current,
      assistant: {
        ...current.assistant,
        stateId: "assistant.explaining",
        visible: true,
      },
      effects: [{ effectId: "effect.focus" }],
    });

    const html = renderToStaticMarkup(
      <AssistantOverlayHost presentationStore={store} />,
    );

    expect(html).toContain('data-companion-visual-state="focusing"');
    expect(html).toContain('data-companion-asset="normal"');
    expect(html.match(/class="lessonique-companion /gu)).toHaveLength(1);
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

  it("renders multi-line guidance as independent exact fragments", () => {
    const store = new ScenePresentationStore();
    const current = store.getSnapshot();
    store.commit({
      ...current,
      sceneId: "scene.fragments",
      beatId: "beat.fragments",
      visibility: "visible",
      guide: { body: "Inspect the exact fragments." },
      targetSnapshot: {
        status: "resolved",
        geometry: {
          left: 120,
          top: 100,
          width: 180,
          height: 54,
          fragments: [
            { left: 140, top: 100, width: 80, height: 18 },
            { left: 120, top: 118, width: 180, height: 18 },
            { left: 120, top: 136, width: 60, height: 18 },
          ],
        },
      },
      effects: [{ effectId: "effect.highlight" }],
    });

    const html = renderToStaticMarkup(
      <AssistantOverlayHost presentationStore={store} />,
    );

    expect(html.match(/data-guidance-fragment=/gu)).toHaveLength(3);
    expect(html).toContain("width:86px");
    expect(html).toContain("width:186px");
    expect(html).not.toContain("width:800px");
  });

  it("replaces target overlays with a compact paused guide while the target is out of view", () => {
    const store = new ScenePresentationStore();
    const current = store.getSnapshot();
    store.commit({
      ...current,
      visibility: "out-of-view",
      target: {
        resolverId: "target.code-range",
        input: { filePath: "index.js" },
      },
      targetSnapshot: { status: "lost" },
      guide: { title: "Variables", body: "Explain the current variable." },
      effects: [{ effectId: "effect.focus" }],
      navigation: { ...current.navigation, current: 2, total: 9 },
    });

    const html = renderToStaticMarkup(
      <AssistantOverlayHost presentationStore={store} />,
    );

    expect(html).toContain('data-guidance-visibility="out-of-view"');
    expect(html).toContain("The explained element is out of view");
    expect(html).toContain("Return to step");
    expect(html).not.toContain("data-guidance-effect=");
    expect(html).not.toContain("Lessonique companion:");
  });

  it("preserves the scene behind a non-invasive resume control when hidden", () => {
    const store = new ScenePresentationStore();
    const current = store.getSnapshot();
    store.commit({
      ...current,
      sceneId: "scene.hidden",
      beatId: "beat.4",
      visibility: "hidden-by-user",
      guide: { title: "Hidden guide", body: "Keep this exact beat." },
      navigation: { ...current.navigation, current: 4, total: 9 },
    });

    const html = renderToStaticMarkup(
      <AssistantOverlayHost presentationStore={store} />,
    );

    expect(html).toContain('aria-label="Resume guide"');
    expect(html).not.toContain("Hidden guide");
    expect(store.getSnapshot().beatId).toBe("beat.4");
  });
});
