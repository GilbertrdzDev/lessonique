import type { PlayTeachingSceneInput, TargetRefInput } from "@/core/webmcp";

import {
  RESPONSIVE_MENU_DEMO_IDS,
  RESPONSIVE_MENU_TARGET_CATALOG,
} from "./responsive-menu-fixture";

export const RESPONSIVE_MENU_SCENE_IDS = {
  html: "scene.responsive-menu-html",
  css: "scene.responsive-menu-css",
  javascript: "scene.responsive-menu-javascript",
  warning: "scene.responsive-menu-warning",
  completion: "scene.responsive-menu-completion",
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
        lessonStepId: RESPONSIVE_MENU_DEMO_IDS.htmlStep,
        type: "explanation",
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
        lessonStepId: RESPONSIVE_MENU_DEMO_IDS.htmlStep,
        type: "explanation",
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
        lessonStepId: RESPONSIVE_MENU_DEMO_IDS.accessibilityStep,
        type: "interaction",
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
        lessonStepId: RESPONSIVE_MENU_DEMO_IDS.cssStep,
        type: "explanation",
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
        lessonStepId: RESPONSIVE_MENU_DEMO_IDS.cssStep,
        type: "explanation",
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

export function createResponsiveMenuJavascriptScene(
  javascriptHandlerTarget: TargetRefInput,
): PlayTeachingSceneInput {
  const mobileMenuTarget = RESPONSIVE_MENU_TARGET_CATALOG.mobileMenuToggle.target;
  return {
    id: RESPONSIVE_MENU_SCENE_IDS.javascript,
    title: "Responsive menu JavaScript interaction",
    cleanupPolicy: "replace",
    allowManualNavigation: true,
    beats: [
      {
        id: "beat.responsive-menu-javascript-source",
        lessonStepId: RESPONSIVE_MENU_DEMO_IDS.javascriptStep,
        type: "explanation",
        prepare: {
          surfaceId: "editor",
          filePath: "script.js",
          scroll: "if-needed",
        },
        target: javascriptHandlerTarget,
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
              text: "Trace one click from the control to both the visible and accessible menu state.",
            },
          },
        ],
        guide: {
          title: "Connect one interaction to two states",
          body: "The semantic JavaScript locator found the registered click listener. Its handler reads the current state once, then updates the button and navigation together.",
          supportingItems: [
            "The source target comes from the JavaScript provider",
            "Accessible and visual state share one `boolean`",
          ],
        },
        caption: "The listener is highlighted without exposing a selector or executable locator.",
      },
      {
        id: "beat.responsive-menu-javascript-preview",
        lessonStepId: RESPONSIVE_MENU_DEMO_IDS.javascriptStep,
        type: "interaction",
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
          { effectId: "effect.pointer" },
          {
            effectId: "effect.callout",
            input: {
              text: "Activate the menu control to verify the handler through the preview bridge.",
            },
          },
        ],
        guide: {
          title: "Run the registered interaction",
          body: "Activate the mobile menu control. The preview bridge emits a normalized click for this semantic target, so the learner wait resolves locally.",
          supportingItems: [
            "The same registered target guides and observes",
            "No follow-up agent call is required",
          ],
        },
        caption: "A matching preview click triggers the assistant success reaction and completes the scene.",
        wait: {
          kind: "interaction",
          eventTypeId: "interaction.preview-click",
          target: mobileMenuTarget,
          timeoutMs: 300_000,
        },
      },
    ],
  };
}

export function createResponsiveMenuWarningScene(): PlayTeachingSceneInput {
  return {
    id: RESPONSIVE_MENU_SCENE_IDS.warning,
    title: "Responsive menu warning fixture",
    cleanupPolicy: "replace",
    allowManualNavigation: true,
    beats: [
      {
        id: "beat.responsive-menu-warning",
        type: "feedback",
        target: RESPONSIVE_MENU_TARGET_CATALOG.learningPlan.target,
        assistant: {
          stateId: "assistant.warning",
          placementId: "placement.near-target",
          visible: true,
        },
        effects: [
          { effectId: "effect.focus" },
          {
            effectId: "effect.callout",
            input: {
              text: "This safe fixture previews warning feedback without changing learner files or progress.",
            },
          },
        ],
        guide: {
          title: "Preview bounded warning feedback",
          body: "Warnings keep the companion visible, explain what needs attention, and leave the learner in control. This fixture is visual-only and makes no workspace mutation.",
          supportingItems: [
            "No learner code is changed",
            "The next action remains explicit",
          ],
        },
        caption: "The warning treatment is safe to replay from the Dev Panel.",
      },
    ],
  };
}

export function createResponsiveMenuCompletionScene(): PlayTeachingSceneInput {
  return {
    id: RESPONSIVE_MENU_SCENE_IDS.completion,
    title: "Responsive menu celebration and close",
    cleanupPolicy: "replace",
    allowManualNavigation: true,
    beats: [
      {
        id: "beat.responsive-menu-celebration",
        lessonStepId: RESPONSIVE_MENU_DEMO_IDS.verificationStep,
        type: "feedback",
        prepare: {
          surfaceId: "preview",
          viewportId: "mobile",
          scroll: "if-needed",
        },
        target: RESPONSIVE_MENU_TARGET_CATALOG.mobileMenuToggle.target,
        assistant: {
          stateId: "assistant.success",
          placementId: "placement.near-target",
          visible: true,
        },
        effects: [
          { effectId: "effect.focus" },
          { effectId: "effect.spotlight" },
          {
            effectId: "effect.callout",
            input: {
              text: "The structure, breakpoint, handler, preview, and console checks all passed.",
            },
          },
        ],
        guide: {
          title: "Celebrate verified behavior",
          body: "The companion reacts to evidence from the registered validators, not to an assumed outcome. The responsive menu is now complete across source and preview surfaces.",
          supportingItems: [
            "Every declared criterion passed",
            "The learner interaction was observed locally",
          ],
        },
        caption: "Success feedback remains visual, structured, and evidence-backed.",
      },
      {
        id: "beat.responsive-menu-close",
        lessonStepId: RESPONSIVE_MENU_DEMO_IDS.verificationStep,
        type: "feedback",
        target: RESPONSIVE_MENU_TARGET_CATALOG.learningPlan.target,
        assistant: {
          stateId: "assistant.idle",
          placementId: "placement.near-target",
          visible: true,
        },
        effects: [{ effectId: "effect.focus" }],
        guide: {
          title: "Return to the completed plan",
          body: "The closing beat moves the companion back to the lesson plan, preserves the completion evidence, and then clears all temporary guidance.",
          supportingItems: [
            "The workspace remains available",
            "Scene overlays clean up automatically",
          ],
        },
        caption: "The companion returns to idle as the completed lesson remains in place.",
      },
    ],
  };
}
