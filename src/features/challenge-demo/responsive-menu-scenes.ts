import type { PlayTeachingSceneInput, TargetRefInput } from "@/core/webmcp";

import {
  RESPONSIVE_MENU_TARGET_CATALOG,
} from "./responsive-menu-fixture";

export const RESPONSIVE_MENU_SCENE_IDS = {
  html: "scene.responsive-menu-html",
  css: "scene.responsive-menu-css",
} as const;

export function createResponsiveMenuHtmlScene(
  htmlNavigationTarget: TargetRefInput,
): PlayTeachingSceneInput {
  const previewActionTarget = RESPONSIVE_MENU_TARGET_CATALOG.previewAction.target;
  return {
    id: RESPONSIVE_MENU_SCENE_IDS.html,
    title: "Responsive menu HTML structure",
    cleanupPolicy: "replace",
    allowManualNavigation: true,
    beats: [
      {
        id: "beat.responsive-menu-html-plan",
        target: RESPONSIVE_MENU_TARGET_CATALOG.learningPlan.target,
        assistant: {
          stateId: "assistant.explaining",
          placementId: "placement.near-target",
          visible: true,
        },
        effects: [
          { effectId: "effect.focus" },
          { effectId: "effect.pointer" },
        ],
        guide: {
          title: "Start with meaningful structure",
          body: "The first lesson step connects a visible menu control to a navigation landmark before responsive styling is introduced.",
          supportingItems: [
            "Use a navigation landmark",
            "Keep control state understandable",
          ],
        },
        caption: "The lesson plan remains the source of progress for this scene.",
      },
      {
        id: "beat.responsive-menu-html-source",
        prepare: {
          surfaceId: "editor",
          filePath: "index.html",
          scroll: "if-needed",
        },
        target: htmlNavigationTarget,
        assistant: {
          stateId: "assistant.pointing",
          placementId: "placement.near-target",
          visible: true,
        },
        effects: [
          { effectId: "effect.focus" },
          { effectId: "effect.highlight" },
          { effectId: "effect.pointer" },
          {
            effectId: "effect.callout",
            input: {
              text: "Hint: connect the button to this landmark with matching semantic state.",
            },
          },
        ],
        guide: {
          title: "Inspect the navigation landmark",
          body: "Notice the stable navigation ID, its accessible label, and the lesson-owned anchor used by the preview bridge.",
          supportingItems: [
            "The target was resolved from an HTML locator",
            "No raw selector or DOM path entered the scene",
          ],
        },
        caption: "Highlighted learner code stays visible while the companion points nearby.",
      },
      {
        id: "beat.responsive-menu-html-action",
        prepare: {
          surfaceId: "preview",
          viewportId: "desktop",
          scroll: "if-needed",
        },
        target: previewActionTarget,
        assistant: {
          stateId: "assistant.pointing",
          placementId: "placement.near-target",
          visible: true,
        },
        effects: [
          { effectId: "effect.focus" },
          { effectId: "effect.spotlight" },
          { effectId: "effect.pointer" },
          {
            effectId: "effect.callout",
            input: { text: "Activate this preview control when you are ready to continue." },
          },
        ],
        guide: {
          title: "Confirm the structure in context",
          body: "Use the visible preview action to satisfy the learner wait locally. The scene does not need another agent call to observe it.",
          supportingItems: [
            "The preview emits a normalized interaction",
            "The local wait matches the registered anchor",
          ],
        },
        caption: "The scene resumes only after the learner activates the highlighted control.",
        wait: {
          kind: "interaction",
          eventTypeId: "interaction.preview-click",
          target: previewActionTarget,
          timeoutMs: 300_000,
        },
      },
    ],
  };
}

export function createResponsiveMenuCssScene(
  cssMediaQueryTarget: TargetRefInput,
): PlayTeachingSceneInput {
  const mobileMenuTarget = RESPONSIVE_MENU_TARGET_CATALOG.mobileMenuToggle.target;
  return {
    id: RESPONSIVE_MENU_SCENE_IDS.css,
    title: "Responsive menu CSS and mobile layout",
    cleanupPolicy: "replace",
    allowManualNavigation: true,
    beats: [
      {
        id: "beat.responsive-menu-css-source",
        prepare: {
          surfaceId: "editor",
          filePath: "styles.css",
          scroll: "if-needed",
        },
        target: cssMediaQueryTarget,
        assistant: {
          stateId: "assistant.pointing",
          placementId: "placement.near-target",
          visible: true,
        },
        effects: [
          { effectId: "effect.focus" },
          { effectId: "effect.highlight" },
          { effectId: "effect.pointer" },
          {
            effectId: "effect.callout",
            input: {
              text: "Keep the mobile control and navigation changes inside one breakpoint.",
            },
          },
        ],
        guide: {
          title: "Read the mobile breakpoint as one rule",
          body: "The media query changes the header grid, reveals the menu control, and gives the navigation a compact stacked layout.",
          supportingItems: [
            "One semantic CSS source target",
            "One coordinated responsive state",
          ],
        },
        caption: "The editor highlight comes from the registered CSS media-query locator.",
      },
      {
        id: "beat.responsive-menu-css-mobile",
        prepare: {
          surfaceId: "preview",
          viewportId: "mobile",
          scroll: "if-needed",
        },
        target: mobileMenuTarget,
        assistant: {
          stateId: "assistant.pointing",
          placementId: "placement.near-target",
          visible: true,
        },
        effects: [
          { effectId: "effect.focus" },
          { effectId: "effect.spotlight" },
          { effectId: "effect.highlight" },
          { effectId: "effect.pointer" },
          {
            effectId: "effect.callout",
            input: {
              text: "This registered control stays tracked while the mobile preview moves or resizes.",
            },
          },
        ],
        guide: {
          title: "Follow the control into the mobile preview",
          body: "The companion moves from the CSS source to the rendered menu control. Target geometry remains local and updates through the Preview Bridge.",
          supportingItems: [
            "Responsive geometry is observed",
            "Collision-safe placement keeps the control clear",
          ],
        },
        caption: "The companion and guide remain inside safe bounds without covering the target.",
      },
    ],
  };
}
