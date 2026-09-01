import { expect, test, type Page } from "@playwright/test";

import type { TargetRefInput } from "@/core/webmcp";
import {
  createResponsiveMenuCompletionScene,
  createResponsiveMenuCssScene,
  createResponsiveMenuHtmlScene,
  createResponsiveMenuJavascriptScene,
  createResponsiveMenuLessonFixture,
  createResponsiveMenuWarningScene,
  RESPONSIVE_MENU_DEMO_IDS,
  RESPONSIVE_MENU_DEMO_TOPICS,
  RESPONSIVE_MENU_TARGET_CATALOG,
  type ResponsiveMenuDemoTopicId,
  type ResponsiveMenuTargetCatalogEntry,
} from "@/features/challenge-demo";

type ToolResultRecord = Readonly<{
  ok?: boolean;
  status?: string;
  data?: unknown;
  error?: unknown;
}>;

test.describe("S007 challenge demo verification", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const registeredTools: Array<{
        name: string;
        inputSchema: { additionalProperties?: boolean };
        execute: (input: unknown) => Promise<unknown>;
      }> = [];
      Object.defineProperty(window, "__lessoniqueRegisteredTools", {
        configurable: true,
        value: registeredTools,
      });
      Object.defineProperty(document, "modelContext", {
        configurable: true,
        value: {
          registerTool: async (tool: (typeof registeredTools)[number]) => {
            registeredTools.push(tool);
          },
        },
      });
      const blockedAudioApiCalls: string[] = [];
      Object.defineProperty(window, "__lessoniqueBlockedAudioApiCalls", {
        configurable: true,
        value: blockedAudioApiCalls,
      });
      HTMLMediaElement.prototype.play = function blockedMediaPlayback() {
        blockedAudioApiCalls.push("HTMLMediaElement.play");
        return Promise.reject(new DOMException("Media playback is blocked.", "NotAllowedError"));
      };
      if (window.speechSynthesis) {
        Object.defineProperty(window.speechSynthesis, "speak", {
          configurable: true,
          value: () => {
            blockedAudioApiCalls.push("speechSynthesis.speak");
            throw new DOMException("Speech synthesis is blocked.", "NotAllowedError");
          },
        });
      }
    });
    await page.goto("/");
    await initializeClassroomThroughWebMCP(page);
  });

  test("preserves the complete visual contract through the Dev Panel with reduced motion and target churn", async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    test.skip(testInfo.project.name !== "desktop-chromium");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(
      page.getByRole("combobox", { name: "Environment profile" }),
    ).toBeEnabled();

    const panel = page.locator('[data-slot="webmcp-dev-panel"]');
    await panel.locator("summary").first().click();
    const challengeFixtures = panel.locator("details").filter({
      has: page.getByText("Challenge Demo fixtures", { exact: true }),
    });
    const invocationResult = panel.locator('pre[role="status"]');
    await challengeFixtures.locator("summary").click();
    await runPanelStage(challengeFixtures, invocationResult, /Set up responsive menu/u);
    await expect(page.locator(".sp-loading:visible")).toHaveCount(0, {
      timeout: 30_000,
    });

    await runPanelStage(challengeFixtures, invocationResult, /Run HTML scene/u);
    const overlay = page.getByLabel("Lessonique visual guidance");
    const guide = page.getByLabel("Teaching guide");
    await expect(guide).toContainText("Start with meaningful structure");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(guide).toContainText("Inspect the navigation landmark");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    try {
      await expect(guide).toContainText("Confirm the structure in context", {
        timeout: 30_000,
      });
    } catch (error) {
      const scene = await invokeRegisteredTool(page, "inspect_classroom", {
        include: ["scene", "assistant"],
      });
      throw new Error(
        `The HTML action beat did not remain active. Inspection: ${JSON.stringify(scene)}`,
        { cause: error },
      );
    }
    await expect(guide).toContainText(
      "Use the visible preview action to satisfy the learner wait locally.",
    );
    await expect(guide).toContainText(
      "The scene resumes only after the learner activates the highlighted control.",
    );
    await expect(page.getByRole("button", { name: "Finish", exact: true })).toBeDisabled();
    await expect(page.locator("[data-guidance-effect]")).toHaveCount(0);
    const htmlGuideText = await guide.textContent();
    expect(htmlGuideText?.indexOf("The preview emits a normalized interaction")).toBeLessThan(
      htmlGuideText?.indexOf("The local wait matches the registered anchor") ?? -1,
    );
    await expect(overlay).toHaveAttribute("data-reduced-motion", "true");
    await expect
      .poll(async () =>
        Number.parseFloat(
          await overlay
            .locator("[data-assistant-docked]")
            .evaluate((element) => getComputedStyle(element).transitionDuration),
        ),
      )
      .toBeLessThanOrEqual(0.001);
    await expect(invocationResult).toContainText("locator.html.element");
    await expect(invocationResult).toContainText("target.code-range");

    const preview = page.frameLocator("[data-preview-viewport]:visible iframe");
    await expect(page.locator(".sp-loading:visible")).toHaveCount(0, {
      timeout: 30_000,
    });
    await preview.getByRole("button", { name: "Explore routes" }).click();
    await expect(overlay).toHaveCount(0);
    const interactionInspection = requireToolResult(
      await invokeRegisteredTool(page, "inspect_classroom", {
        include: ["interaction_targets"],
      }),
    );
    expect(JSON.stringify(interactionInspection.data)).toContain(
      "interaction.preview-click",
    );

    await runPanelStage(
      challengeFixtures,
      invocationResult,
      /Run CSS and mobile scene/u,
    );
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(guide).toContainText("Follow the control into the mobile preview", {
      timeout: 30_000,
    });
    await expect(overlay).toHaveAttribute("data-reduced-motion", "true");
    await invokeSceneControl(page, "pause", "scene.responsive-menu-css");
    await expect.poll(() => previewMenuTargetAlignmentDelta(page)).toBeLessThanOrEqual(2);

    const menuButton = preview.getByRole("button", { name: "Menu" });
    await menuButton.evaluate((element) => {
      const frameWindow = window as typeof window & {
        __lessoniqueDetachedMenuTarget?: {
          element: Element;
          nextSibling: Node | null;
          parent: Element;
        };
      };
      const parent = element.parentElement;
      if (!parent) throw new Error("The preview menu target has no parent.");
      frameWindow.__lessoniqueDetachedMenuTarget = {
        element,
        nextSibling: element.nextSibling,
        parent,
      };
      element.remove();
    });
    await expect(page.locator('[data-guidance-effect="focus"]')).toHaveCount(0);
    await expect(
      page.getByRole("status", { name: /Lessonique companion:/u }),
    ).toHaveCount(0);
    const pausedGuide = page.getByLabel("Teaching guide paused");
    await expect(pausedGuide).toBeVisible();
    await expect(pausedGuide).toContainText("Step paused");
    await expect(page.getByRole("button", { name: "Return to step" })).toBeVisible();

    await preview.locator("body").evaluate(() => {
      const frameWindow = window as typeof window & {
        __lessoniqueDetachedMenuTarget?: {
          element: Element;
          nextSibling: Node | null;
          parent: Element;
        };
      };
      const detached = frameWindow.__lessoniqueDetachedMenuTarget;
      if (!detached) throw new Error("The detached preview target is unavailable.");
      detached.parent.insertBefore(detached.element, detached.nextSibling);
      delete frameWindow.__lessoniqueDetachedMenuTarget;
    });
    await expect(page.locator('[data-guidance-effect="focus"]')).toBeVisible();
    await expect(pausedGuide).toHaveCount(0);
    await expect(guide).toBeVisible();
    await expect.poll(() => previewMenuTargetAlignmentDelta(page)).toBeLessThanOrEqual(2);
    await invokeSceneControl(page, "resume", "scene.responsive-menu-css");
    await page.getByRole("button", { name: "Finish", exact: true }).click();
    await expect(overlay).toHaveCount(0, { timeout: 10_000 });

    await runPanelStage(
      challengeFixtures,
      invocationResult,
      /Run JavaScript scene/u,
    );
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(guide).toContainText("Run the registered interaction", {
      timeout: 30_000,
    });
    await expect(invocationResult).toContainText("locator.javascript.event-listener");
    await menuButton.click();
    await expect(menuButton).toHaveAttribute("aria-expanded", "true");
    await expect(
      page.getByRole("status", { name: /Lessonique companion: success/u }),
    ).toBeVisible();
    await expect(overlay).toHaveCount(0, { timeout: 10_000 });

    await showChallengeReferenceFromPanel(page);
    const reference = page.locator(
      '[data-interaction-anchor="anchor.reference-panel"]',
    );
    await expect(reference).toContainText("Responsive menu evidence");
    await expect(reference).toContainText("Semantic targets stay provider-owned.");
    await expect(reference).toContainText('menuToggle.setAttribute("aria-expanded"');

    const toolSelector = page.getByRole("combobox", { name: "WebMCP tool" });
    await toolSelector.selectOption("get_system_capabilities");
    await page.getByRole("button", { name: "Run selected tool" }).click();
    await expect(invocationResult).toContainText('"ok": true');
    expect(await invocationResult.textContent()).not.toMatch(
      /voice|audio|narration|speech|synthesis|ssml|playback/iu,
    );

    await toolSelector.selectOption("play_teaching_scene");
    await page.getByLabel("Tool input JSON").fill(
      JSON.stringify({
        id: "scene.challenge-forbidden-audio",
        cleanupPolicy: "replace",
        allowManualNavigation: true,
        narration: "Read this guide aloud.",
        beats: [
          { id: "beat.challenge-forbidden-audio", type: "explanation" },
        ],
      }),
    );
    await page.getByRole("button", { name: "Run selected tool" }).click();
    await expect(invocationResult).toContainText('"ok": false');
    await expect(invocationResult).toContainText('"code": "invalid_input"');
    await expect(page.getByLabel("Tool input JSON")).toHaveValue(/narration/u);
    const rejectedSceneInspection = requireToolResult(
      await invokeRegisteredTool(page, "inspect_classroom", { include: ["scene"] }),
    );
    expect(readRecord(rejectedSceneInspection.data).scene).toEqual(
      expect.objectContaining({ resources: { scenes: 0, waits: 0, overlays: 0 } }),
    );

    expect(await readBlockedAudioApiCalls(page)).toEqual({
      host: [],
      preview: [],
    });
  });

  test("rehearses the primary demo three times through ChatGPT-registered tools without a reload", async ({
    page,
  }, testInfo) => {
    test.setTimeout(160_000);
    test.skip(testInfo.project.name !== "desktop-chromium");
    await expect(
      page.getByRole("combobox", { name: "Environment profile" }),
    ).toBeEnabled();
    await expect(page.locator(".sp-loading:visible")).toHaveCount(0, {
      timeout: 30_000,
    });
    await page.evaluate(() => {
      (window as typeof window & { __lessoniqueChallengeRunMarker?: string })
        .__lessoniqueChallengeRunMarker = "same-document";
    });

    const startedAt = Date.now();
    const topics: readonly ResponsiveMenuDemoTopicId[] = [
      "trails",
      "observatory",
      "trails",
    ];
    for (const [index, topicId] of topics.entries()) {
      await runResponsiveMenuRehearsal(page, topicId, index + 1);
    }

    expect(Date.now() - startedAt).toBeLessThan(160_000);
    expect(
      await page.evaluate(
        () =>
          (window as typeof window & { __lessoniqueChallengeRunMarker?: string })
            .__lessoniqueChallengeRunMarker,
      ),
    ).toBe("same-document");
    await expect(page.getByLabel("Lessonique visual guidance")).toHaveCount(0);
    expect(await readBlockedAudioApiCalls(page)).toEqual({
      host: [],
      preview: [],
    });
  });
});

async function runResponsiveMenuRehearsal(
  page: Page,
  topicId: ResponsiveMenuDemoTopicId,
  runNumber: number,
): Promise<void> {
  const topic = RESPONSIVE_MENU_DEMO_TOPICS[topicId];
  expectOk(
    await invokeRegisteredTool(
      page,
      "create_guided_lesson",
      createResponsiveMenuLessonFixture(topicId),
    ),
    `create lesson run ${runNumber}`,
  );
  const createdInspection = requireToolResult(
    await invokeRegisteredTool(page, "inspect_classroom", { include: ["lesson"] }),
  );
  expect(readRecord(createdInspection.data).lesson).toEqual(
    expect.objectContaining({ title: `Build the ${topic.siteTitle} responsive menu` }),
  );
  const preview = page.frameLocator("[data-preview-viewport]:visible iframe");
  await expect(preview.getByRole("heading", { name: topic.heading })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator(".sp-loading:visible")).toHaveCount(0, {
    timeout: 30_000,
  });

  const htmlTarget = await resolveSourceTarget(
    page,
    RESPONSIVE_MENU_TARGET_CATALOG.htmlNavigation,
  );
  expectOk(
    await invokeRegisteredTool(
      page,
      "play_teaching_scene",
      createResponsiveMenuHtmlScene(htmlTarget),
    ),
    `start HTML scene run ${runNumber}`,
  );
  const guide = page.getByLabel("Teaching guide");
  await expect(guide).toContainText("Start with meaningful structure");
  await invokeSceneControl(page, "next", "scene.responsive-menu-html");
  await expect(guide).toContainText("Inspect the navigation landmark");
  await invokeSceneControl(page, "next", "scene.responsive-menu-html");
  await expect(guide).toContainText("Confirm the structure in context");
  await preview.getByRole("button", { name: topic.actionLabel }).click();
  await expect(page.getByLabel("Lessonique visual guidance")).toHaveCount(0);

  const cssTarget = await resolveSourceTarget(
    page,
    RESPONSIVE_MENU_TARGET_CATALOG.cssMobileQuery,
  );
  expectOk(
    await invokeRegisteredTool(
      page,
      "play_teaching_scene",
      createResponsiveMenuCssScene(cssTarget),
    ),
    `start CSS scene run ${runNumber}`,
  );
  await expect(guide).toContainText("Read the mobile breakpoint as one rule");
  await invokeSceneControl(page, "next", "scene.responsive-menu-css");
  await expect(guide).toContainText("Follow the control into the mobile preview");
  await expect.poll(() => previewMenuTargetAlignmentDelta(page)).toBeLessThanOrEqual(2);
  await expect
    .poll(async () => (await previewMenuGuidanceTargetOverlap(page)).area)
    .toBe(0);
  await invokeSceneControl(page, "next", "scene.responsive-menu-css");
  await expect(page.getByLabel("Lessonique visual guidance")).toHaveCount(0);

  const javascriptTarget = await resolveSourceTarget(
    page,
    RESPONSIVE_MENU_TARGET_CATALOG.javascriptToggleHandler,
  );
  expectOk(
    await invokeRegisteredTool(
      page,
      "play_teaching_scene",
      createResponsiveMenuJavascriptScene(javascriptTarget),
    ),
    `start JavaScript scene run ${runNumber}`,
  );
  await expect(guide).toContainText("Connect one interaction to two states");
  await invokeSceneControl(page, "next", "scene.responsive-menu-javascript");
  await expect(guide).toContainText("Run the registered interaction");
  const menuButton = preview.getByRole("button", { name: "Menu" });
  await menuButton.click();
  await expect(menuButton).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByLabel("Lessonique visual guidance")).toHaveCount(0);

  expectOk(
    await invokeRegisteredTool(
      page,
      "play_teaching_scene",
      createResponsiveMenuWarningScene(),
    ),
    `start warning scene run ${runNumber}`,
  );
  await expect(
    page.getByRole("status", { name: /Lessonique companion: warning/u }),
  ).toBeVisible();
  await expect(guide).toContainText("Preview bounded warning feedback");
  await invokeSceneControl(page, "next", "scene.responsive-menu-warning");
  await expect(page.getByLabel("Lessonique visual guidance")).toHaveCount(0);

  for (const stepId of [
    RESPONSIVE_MENU_DEMO_IDS.htmlStep,
    RESPONSIVE_MENU_DEMO_IDS.accessibilityStep,
    RESPONSIVE_MENU_DEMO_IDS.cssStep,
    RESPONSIVE_MENU_DEMO_IDS.javascriptStep,
    RESPONSIVE_MENU_DEMO_IDS.verificationStep,
  ]) {
    const evaluation = requireToolResult(
      await invokeRegisteredTool(page, "evaluate_current_step", {
        stepId,
        advanceOnPass: true,
        showFeedback: true,
      }),
    );
    expect(evaluation.ok, `evaluate ${stepId} during run ${runNumber}`).toBe(true);
    expect(readRecord(evaluation.data).passed).toBe(true);
  }

  expectOk(
    await invokeRegisteredTool(
      page,
      "play_teaching_scene",
      createResponsiveMenuCompletionScene(),
    ),
    `start completion scene run ${runNumber}`,
  );
  await expect(guide).toContainText("Celebrate verified behavior");
  await expect(
    page.getByRole("status", { name: /Lessonique companion: success/u }),
  ).toBeVisible();
  const celebrationTransform = await guidanceWrapper(page).getAttribute("style");
  await invokeSceneControl(page, "next", "scene.responsive-menu-completion");
  await expect(guide).toContainText("Return to the completed plan");
  await expect(
    page.getByRole("status", { name: /Lessonique companion: idle/u }),
  ).toBeVisible();
  expect(await guidanceWrapper(page).getAttribute("style")).not.toBe(
    celebrationTransform,
  );
  await invokeSceneControl(page, "next", "scene.responsive-menu-completion");
  await expect(page.getByLabel("Lessonique visual guidance")).toHaveCount(0);

  const inspection = requireToolResult(
    await invokeRegisteredTool(page, "inspect_classroom", {
      include: ["lesson", "scene", "assistant", "interaction_targets"],
      maxActivity: 20,
    }),
  );
  const inspectedData = readRecord(inspection.data);
  expect(inspectedData.lesson).toEqual(
    expect.objectContaining({
      id: RESPONSIVE_MENU_DEMO_IDS.lesson,
      progress: {
        completedSteps: 5,
        failedSteps: 0,
        percentage: 100,
        totalSteps: 5,
      },
    }),
  );
  expect(inspectedData.scene).toEqual(
    expect.objectContaining({
      status: "completed",
      resources: { scenes: 0, waits: 0, overlays: 0 },
    }),
  );
  expect(inspectedData.assistant).toEqual(
    expect.objectContaining({ stateId: "assistant.idle", visible: false }),
  );
  expect(JSON.stringify(inspectedData.interactionTargets)).toContain(
    "interaction.preview-click",
  );
}

async function runPanelStage(
  challengeFixtures: ReturnType<Page["locator"]>,
  invocationResult: ReturnType<Page["locator"]>,
  name: RegExp,
): Promise<void> {
  await challengeFixtures.getByRole("button", { name }).click();
  await expect(invocationResult).toContainText('"accepted": true');
}

async function showChallengeReferenceFromPanel(page: Page): Promise<void> {
  await page.getByRole("combobox", { name: "WebMCP tool" }).selectOption(
    "show_reference_panel",
  );
  await page.getByLabel("Tool input JSON").fill(
    JSON.stringify({
      referenceId: "reference.challenge-responsive-menu",
      title: "Responsive menu evidence",
      content: "Semantic targets stay provider-owned.",
      snippets: [
        {
          languageId: "language.javascript",
          code: 'menuToggle.setAttribute("aria-expanded", String(!isOpen));',
        },
      ],
      surfaceId: "reference",
      focus: false,
    }),
  );
  await page.getByRole("button", { name: "Run selected tool" }).click();
  await expect(page.locator('[data-slot="webmcp-dev-panel"] pre[role="status"]')).toContainText(
    '"ok": true',
  );
}

async function resolveSourceTarget(
  page: Page,
  entry: Extract<ResponsiveMenuTargetCatalogEntry, { kind: "source" }>,
): Promise<TargetRefInput> {
  const inspection = requireToolResult(
    await invokeRegisteredTool(page, "inspect_classroom", {
      include: ["anchors"],
      anchorQuery: entry.query,
    }),
  );
  const anchors = readRecord(inspection.data).anchors;
  if (!Array.isArray(anchors)) throw new Error("The semantic anchor list is unavailable.");
  for (const anchor of anchors) {
    const targets = readRecord(anchor).targets;
    if (!Array.isArray(targets)) continue;
    for (const mapping of targets) {
      const record = readRecord(mapping);
      if (record.representation === entry.representation) {
        return readRecord(record.target) as TargetRefInput;
      }
    }
  }
  throw new Error(`The semantic target "${entry.id}" could not be resolved.`);
}

async function invokeRegisteredTool(
  page: Page,
  name: string,
  input: unknown,
): Promise<unknown> {
  return page.evaluate(async ({ toolName, toolInput }) => {
    const tools = (
      window as typeof window & {
        __lessoniqueRegisteredTools: Array<{
          name: string;
          execute: (input: unknown) => Promise<unknown>;
        }>;
      }
    ).__lessoniqueRegisteredTools;
    const tool = tools.find(({ name }) => name === toolName);
    if (!tool) throw new Error(`Registered WebMCP tool "${toolName}" is unavailable.`);
    return tool.execute(toolInput);
  }, { toolInput: input, toolName: name });
}

async function initializeClassroomThroughWebMCP(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              __lessoniqueRegisteredTools: Array<{ name: string }>;
            }
          ).__lessoniqueRegisteredTools.length,
      ),
    )
    .toBe(12);

  expectOk(
    await invokeRegisteredTool(page, "create_guided_lesson", {
      lessonId: "lesson.challenge-shell",
      lessonMode: "mixed",
      title: "Challenge verification lesson",
      objective: "Prepare the classroom before running challenge fixtures.",
      replaceExisting: true,
      environment: {
        profileId: "profile.vanilla-web",
        languageIds: ["language.javascript"],
        activeFile: "script.js",
        activeSurfaceId: "editor",
      },
      files: [
        {
          path: "script.js",
          languageId: "language.javascript",
          content: "const challengeReady = true;",
        },
      ],
      steps: [
        {
          id: "step.challenge-shell",
          title: "Prepare the challenge",
          objective: "Load the complete responsive-menu challenge fixture.",
        },
      ],
    }),
    "initialize challenge classroom",
  );
  await expect(
    page.getByRole("main", { name: "Lessonique Classroom" }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(
    page.locator('[data-slot="classroom-transition"]'),
  ).toHaveCSS("opacity", "1");
  await expect(
    page.locator('[data-slot="classroom-transition"]'),
  ).toHaveCSS("transform", "none");
}

async function readBlockedAudioApiCalls(
  page: Page,
): Promise<{ host: string[]; preview: string[] }> {
  const readCalls = () =>
    (window as typeof window & { __lessoniqueBlockedAudioApiCalls: string[] })
      .__lessoniqueBlockedAudioApiCalls;
  return {
    host: await page.evaluate(readCalls),
    preview: await page
      .frameLocator("[data-preview-viewport]:visible iframe")
      .locator("body")
      .evaluate(readCalls),
  };
}

async function invokeSceneControl(
  page: Page,
  action: "next" | "pause" | "resume",
  sceneId: string,
): Promise<void> {
  expectOk(
    await invokeRegisteredTool(page, "control_teaching_scene", { action, sceneId }),
    `${action} ${sceneId}`,
  );
}

function expectOk(result: unknown, label: string): void {
  expect(requireToolResult(result), label).toEqual(expect.objectContaining({ ok: true }));
}

function requireToolResult(value: unknown): ToolResultRecord {
  const result = readRecord(value);
  return result;
}

function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected a record-shaped WebMCP result.");
  }
  return value as Record<string, unknown>;
}

function guidanceWrapper(page: Page) {
  return page
    .getByLabel("Lessonique visual guidance")
    .locator("[data-assistant-docked]");
}

async function previewMenuTargetAlignmentDelta(page: Page): Promise<number> {
  const targetRect = await page
    .frameLocator("[data-preview-viewport]:visible iframe")
    .getByRole("button", { name: "Menu" })
    .boundingBox();
  const focusRect = await page.locator('[data-guidance-effect="focus"]').boundingBox();
  if (!targetRect || !focusRect) return Number.POSITIVE_INFINITY;
  return Math.max(
    Math.abs(focusRect.x + 4 - targetRect.x),
    Math.abs(focusRect.y + 4 - targetRect.y),
    Math.abs(focusRect.width - 8 - targetRect.width),
    Math.abs(focusRect.height - 8 - targetRect.height),
  );
}

async function previewMenuGuidanceTargetOverlap(
  page: Page,
): Promise<{ area: number }> {
  const targetRect = await page
    .frameLocator("[data-preview-viewport]:visible iframe")
    .getByRole("button", { name: "Menu" })
    .boundingBox();
  const [guideRect, companionRect] = await Promise.all([
    page.locator('[data-slot="assistant-overlay-host"] [data-slot="visual-guide"]').boundingBox(),
    page.locator('[data-slot="assistant-overlay-host"] [data-assistant-state]').boundingBox(),
  ]);
  if (!targetRect || !guideRect) return { area: Number.POSITIVE_INFINITY };
  const overlapArea = (candidate: NonNullable<typeof guideRect>) => {
    const overlapWidth = Math.max(
      0,
      Math.min(targetRect.x + targetRect.width, candidate.x + candidate.width) -
        Math.max(targetRect.x, candidate.x),
    );
    const overlapHeight = Math.max(
      0,
      Math.min(targetRect.y + targetRect.height, candidate.y + candidate.height) -
        Math.max(targetRect.y, candidate.y),
    );
    return overlapWidth * overlapHeight;
  };
  return {
    area: overlapArea(guideRect) + (companionRect ? overlapArea(companionRect) : 0),
  };
}
