import type {
  CreateGuidedLessonInput,
  InspectClassroomInput,
  TargetRefInput,
} from "@/core/webmcp";

export const RESPONSIVE_MENU_DEMO_IDS = {
  lesson: "lesson.responsive-menu",
  htmlStep: "step.responsive-menu-html",
  accessibilityStep: "step.responsive-menu-accessibility",
  cssStep: "step.responsive-menu-css",
  javascriptStep: "step.responsive-menu-javascript",
  verificationStep: "step.responsive-menu-verification",
} as const;

export const RESPONSIVE_MENU_INTERACTION_ANCHORS = {
  brand: "demo.responsive-menu.brand",
  navigation: "demo.responsive-menu.navigation",
  menuToggle: "demo.responsive-menu.toggle",
  previewAction: "demo.responsive-menu.preview-action",
} as const;

export const RESPONSIVE_MENU_DEMO_TOPICS = {
  trails: {
    siteTitle: "Trailbound",
    eyebrow: "Weekend field notes",
    heading: "Plan a better day outside",
    summary:
      "Build a clear route from the trailhead to the view, then share it with your group.",
    navigationItems: ["Routes", "Skills", "Community"],
    actionLabel: "Explore routes",
  },
  observatory: {
    siteTitle: "Night Atlas",
    eyebrow: "Community sky guide",
    heading: "Find tonight's brightest objects",
    summary:
      "Choose a viewing window, prepare your equipment, and keep a field log with your group.",
    navigationItems: ["Sky map", "Equipment", "Field notes"],
    actionLabel: "Open the sky map",
  },
} as const;

export type ResponsiveMenuDemoTopicId = keyof typeof RESPONSIVE_MENU_DEMO_TOPICS;

type AnchorQuery = NonNullable<InspectClassroomInput["anchorQuery"]>;

export type ResponsiveMenuTargetCatalogEntry =
  | Readonly<{
      id: string;
      kind: "source";
      query: AnchorQuery;
      representation: "editor" | "preview";
    }>
  | Readonly<{
      id: string;
      kind: "registered";
      target: TargetRefInput;
    }>;

export const RESPONSIVE_MENU_TARGET_CATALOG = {
  learningPlan: {
    id: "target.demo.learning-plan",
    kind: "registered",
    target: {
      resolverId: "target.surface-anchor",
      input: { anchorId: "anchor.learning-plan" },
    },
  },
  htmlNavigation: {
    id: "target.demo.html-navigation",
    kind: "source",
    representation: "editor",
    query: {
      resolverId: "locator.html.element",
      input: {
        filePath: "index.html",
        tagName: "nav",
        id: "site-navigation",
      },
    },
  },
  previewAction: {
    id: "target.demo.preview-action",
    kind: "registered",
    target: {
      resolverId: "target.preview-anchor",
      input: { anchorId: RESPONSIVE_MENU_INTERACTION_ANCHORS.previewAction },
    },
  },
  cssMobileQuery: {
    id: "target.demo.css-mobile-query",
    kind: "source",
    representation: "editor",
    query: {
      resolverId: "locator.css.media-query",
      input: {
        filePath: "styles.css",
        feature: "max-width",
        value: "48rem",
      },
    },
  },
  javascriptToggleHandler: {
    id: "target.demo.javascript-toggle-handler",
    kind: "source",
    representation: "editor",
    query: {
      resolverId: "locator.javascript.event-listener",
      input: {
        filePath: "script.js",
        eventType: "click",
        targetKind: "identifier",
        targetName: "menuToggle",
      },
    },
  },
  mobileMenuToggle: {
    id: "target.demo.mobile-menu-toggle",
    kind: "registered",
    target: {
      resolverId: "target.preview-anchor",
      input: { anchorId: RESPONSIVE_MENU_INTERACTION_ANCHORS.menuToggle },
    },
  },
} as const satisfies Record<string, ResponsiveMenuTargetCatalogEntry>;

export function createResponsiveMenuLessonFixture(
  topicId: ResponsiveMenuDemoTopicId = "trails",
): CreateGuidedLessonInput {
  const topic = RESPONSIVE_MENU_DEMO_TOPICS[topicId];
  return {
    lessonId: RESPONSIVE_MENU_DEMO_IDS.lesson,
    lessonMode: "mixed",
    title: `Build the ${topic.siteTitle} responsive menu`,
    objective:
      "Create and verify an accessible navigation menu that adapts cleanly to a mobile viewport.",
    description:
      "A three-file vanilla web lesson driven through semantic targets, local learner interactions, and local validation.",
    language: "en",
    replaceExisting: true,
    environment: {
      profileId: "profile.vanilla-web",
      languageIds: [
        "language.html",
        "language.css",
        "language.javascript",
      ],
      activeFile: "index.html",
      activeSurfaceId: "editor",
    },
    files: [
      {
        path: "index.html",
        languageId: "language.html",
        content: createHtmlFixture(topic),
      },
      {
        path: "styles.css",
        languageId: "language.css",
        content: RESPONSIVE_MENU_CSS,
      },
      {
        path: "script.js",
        languageId: "language.javascript",
        content: RESPONSIVE_MENU_JAVASCRIPT,
      },
    ],
    steps: [
      {
        id: RESPONSIVE_MENU_DEMO_IDS.htmlStep,
        title: "Create the navigation structure",
        objective: "Use semantic HTML for the brand, menu control, and navigation links.",
        instructions:
          "Review the header structure and identify how the menu button is connected to the navigation region.",
        criteria: [
          {
            id: "criterion.responsive-menu-navigation",
            validatorId: "validator.html-element-exists",
            input: {
              filePath: "index.html",
              tagName: "nav",
              id: "site-navigation",
            },
          },
        ],
        hints: [
          "A navigation landmark should have a stable ID and an accessible label.",
        ],
      },
      {
        id: RESPONSIVE_MENU_DEMO_IDS.accessibilityStep,
        title: "Connect the menu control",
        objective: "Expose the relationship and expanded state of the mobile menu.",
        instructions:
          "Check the menu button attributes before changing its visual presentation.",
        criteria: [
          {
            id: "criterion.responsive-menu-controls",
            validatorId: "validator.html-attribute-exists",
            input: {
              filePath: "index.html",
              tagName: "button",
              id: "menu-toggle",
              attributeName: "aria-controls",
            },
          },
        ],
        hints: [
          "The control should name the navigation region and report whether it is expanded.",
        ],
      },
      {
        id: RESPONSIVE_MENU_DEMO_IDS.cssStep,
        title: "Adapt the layout for mobile",
        objective: "Switch from horizontal links to a compact menu at the declared breakpoint.",
        instructions:
          "Inspect the mobile media query and compare the menu control with the navigation layout.",
        criteria: [
          {
            id: "criterion.responsive-menu-media-query",
            validatorId: "validator.css-media-query-exists",
            input: {
              filePath: "styles.css",
              feature: "max-width",
              value: "48rem",
            },
          },
        ],
        hints: [
          "Keep the breakpoint behavior together so the control and navigation cannot drift apart.",
        ],
      },
      {
        id: RESPONSIVE_MENU_DEMO_IDS.javascriptStep,
        title: "Toggle the menu state",
        objective: "Update the visible and accessible state from one click handler.",
        instructions:
          "Trace the menu button click handler and the state shared with the navigation element.",
        criteria: [
          {
            id: "criterion.responsive-menu-click-handler",
            validatorId: "validator.javascript-event-listener-exists",
            input: {
              filePath: "script.js",
              eventType: "click",
              targetKind: "identifier",
              targetName: "menuToggle",
            },
          },
        ],
        hints: [
          "Read the current expanded value before updating both the control and the navigation.",
        ],
      },
      {
        id: RESPONSIVE_MENU_DEMO_IDS.verificationStep,
        title: "Verify the responsive experience",
        objective: "Confirm the control renders in the preview and the runtime remains error-free.",
        instructions:
          "Use the mobile preview, activate the menu, and inspect the local validation evidence.",
        criteria: [
          {
            id: "criterion.responsive-menu-preview",
            validatorId: "validator.preview-element-exists",
            input: {
              filePath: "index.html",
              tagName: "button",
              id: "menu-toggle",
            },
          },
          {
            id: "criterion.responsive-menu-console",
            validatorId: "validator.no-console-errors",
            input: {},
          },
        ],
        hints: [
          "A successful check includes visible behavior, semantic state, and a clean console.",
        ],
      },
    ],
  };
}

function createHtmlFixture(
  topic: (typeof RESPONSIVE_MENU_DEMO_TOPICS)[ResponsiveMenuDemoTopicId],
): string {
  const navigationLinks = topic.navigationItems
    .map(
      (item, index) =>
        `        <a href="#section-${index + 1}">${item}</a>`,
    )
    .join("\n");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${topic.siteTitle}</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <header class="site-header">
      <a class="brand" data-lessonique-anchor="${RESPONSIVE_MENU_INTERACTION_ANCHORS.brand}" href="#home">${topic.siteTitle}</a>
      <button
        id="menu-toggle"
        class="menu-toggle"
        data-lessonique-anchor="${RESPONSIVE_MENU_INTERACTION_ANCHORS.menuToggle}"
        type="button"
        aria-controls="site-navigation"
        aria-expanded="false"
      >
        Menu
      </button>
      <nav
        id="site-navigation"
        class="site-navigation"
        data-lessonique-anchor="${RESPONSIVE_MENU_INTERACTION_ANCHORS.navigation}"
        data-open="false"
        aria-label="Primary navigation"
      >
${navigationLinks}
      </nav>
    </header>
    <main id="home" class="hero">
      <p class="eyebrow">${topic.eyebrow}</p>
      <h1>${topic.heading}</h1>
      <p>${topic.summary}</p>
      <button
        class="primary-action"
        data-lessonique-anchor="${RESPONSIVE_MENU_INTERACTION_ANCHORS.previewAction}"
        type="button"
      >
        ${topic.actionLabel}
      </button>
    </main>
    <script src="script.js"></script>
  </body>
</html>`;
}

const RESPONSIVE_MENU_CSS = `:root {
  color-scheme: light;
  font-family: Inter, system-ui, sans-serif;
  background: #eef6ff;
  color: #10233f;
}

* {
  box-sizing: border-box;
}

body {
  min-height: 100vh;
  margin: 0;
  background: linear-gradient(145deg, #eef6ff 0%, #f8fbff 48%, #e8f5ee 100%);
}

.site-header {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 2rem;
  padding: 1.25rem clamp(1.25rem, 5vw, 4.5rem);
}

.brand {
  color: inherit;
  font-size: 1.1rem;
  font-weight: 800;
  text-decoration: none;
}

.site-navigation {
  display: flex;
  justify-content: flex-end;
  gap: 1.5rem;
}

.site-navigation a {
  color: #38506f;
  font-weight: 650;
  text-decoration: none;
}

.menu-toggle {
  display: none;
}

.hero {
  width: min(42rem, calc(100% - 2.5rem));
  margin: clamp(3rem, 10vh, 7rem) auto 0;
  padding: clamp(2rem, 5vw, 4rem);
  border: 1px solid rgb(56 80 111 / 16%);
  border-radius: 2rem;
  background: rgb(255 255 255 / 82%);
  box-shadow: 0 2rem 5rem rgb(31 75 119 / 12%);
}

.eyebrow {
  color: #21795a;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

h1 {
  margin: 0.5rem 0 1rem;
  font-size: clamp(2.25rem, 7vw, 4.75rem);
  line-height: 0.98;
}

.primary-action,
.menu-toggle {
  border: 0;
  border-radius: 999px;
  background: #10233f;
  color: white;
  cursor: pointer;
  font: inherit;
  font-weight: 750;
  padding: 0.75rem 1rem;
}

@media (max-width: 48rem) {
  .site-header {
    grid-template-columns: 1fr auto;
    gap: 1rem;
  }

  .menu-toggle {
    display: inline-flex;
  }

  .site-navigation {
    display: none;
    grid-column: 1 / -1;
    flex-direction: column;
    align-items: stretch;
    padding: 1rem;
    border-radius: 1rem;
    background: white;
  }

  .site-navigation[data-open="true"] {
    display: flex;
  }

  .hero {
    margin-top: 2rem;
  }
}`;

const RESPONSIVE_MENU_JAVASCRIPT = `const menuToggle = document.querySelector("#menu-toggle");
const navigation = document.querySelector("#site-navigation");

menuToggle.addEventListener("click", () => {
  const isOpen = menuToggle.getAttribute("aria-expanded") === "true";
  menuToggle.setAttribute("aria-expanded", String(!isOpen));
  navigation.dataset.open = String(!isOpen);
});`;

export const RESPONSIVE_MENU_LESSON_FIXTURE =
  createResponsiveMenuLessonFixture();
