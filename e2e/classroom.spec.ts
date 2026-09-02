import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

test.describe("classroom shell", () => {
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
    });
    await page.goto("/");
    await initializeClassroomThroughWebMCP(page);
  });

  test("registers the closed P0 WebMCP catalog from the top-level document", async ({
    page,
  }) => {
    const expectedNames = [
      "get_system_capabilities",
      "set_guide_build_status",
      "create_guided_lesson",
      "reset_classroom",
      "inspect_classroom",
      "configure_learning_environment",
      "apply_workspace_changes",
      "execute_environment_action",
      "play_teaching_scene",
      "control_teaching_scene",
      "evaluate_current_step",
      "update_lesson_plan",
      "show_reference_panel",
    ];

    await expect
      .poll(() =>
        page.evaluate(() =>
          (
            window as unknown as {
              __lessoniqueRegisteredTools: Array<{
                name: string;
                description: string;
                inputSchema: {
                  additionalProperties?: boolean;
                  properties?: Record<string, unknown>;
                  required?: string[];
                };
              }>;
            }
          ).__lessoniqueRegisteredTools.map(({ name }) => name),
        ),
      )
      .toEqual(expectedNames);

    const discovery = await page.evaluate(async () => {
      const tools = (
        window as unknown as {
          __lessoniqueRegisteredTools: Array<{
            name: string;
            description: string;
            inputSchema: {
              additionalProperties?: boolean;
              properties?: Record<string, unknown>;
              required?: string[];
            };
            execute: (input: unknown) => Promise<unknown>;
          }>;
        }
      ).__lessoniqueRegisteredTools;
      const capabilityTool = tools.find(({ name }) => name === "get_system_capabilities");
      const createTool = tools.find(({ name }) => name === "create_guided_lesson");
      const sceneTool = tools.find(({ name }) => name === "play_teaching_scene");
      const sceneProperties = sceneTool?.inputSchema.properties as
        | { beats?: { items?: { required?: string[] } } }
        | undefined;
      return {
        allClosed: tools.every(
          ({ inputSchema }) => inputSchema.additionalProperties === false,
        ),
        beatTypeRequired:
          sceneProperties?.beats?.items?.required?.includes("type") ?? false,
        createDescription: createTool?.description,
        lessonModeRequired:
          createTool?.inputSchema.required?.includes("lessonMode") ?? false,
        sceneDescription: sceneTool?.description,
        result: await capabilityTool?.execute({ include: ["limits"] }),
      };
    });

    expect(discovery.allClosed).toBe(true);
    expect(discovery.lessonModeRequired).toBe(true);
    expect(discovery.beatTypeRequired).toBe(true);
    expect(discovery.createDescription).toContain("not a workspace full of TODOs");
    expect(discovery.createDescription).toContain(
      "exact token, single line, or contiguous multi-line range",
    );
    expect(discovery.sceneDescription).toContain(
      "one small concept per explanation beat",
    );
    expect(discovery.result).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({ limits: expect.any(Object) }),
      }),
    );
  });

  test("executes every production tool through the in-page Dev Panel fixtures", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium");
    await expect(
      page.getByRole("combobox", { name: "Environment profile" }),
    ).toBeEnabled();

    const panel = page.locator('[data-slot="webmcp-dev-panel"]');
    await panel.locator("summary").first().click();
    const toolSelector = page.getByRole("combobox", { name: "WebMCP tool" });
    await expect(toolSelector.locator("option")).toHaveCount(13);
    await toolSelector.selectOption("play_teaching_scene");
    await expect(page.getByLabel("Tool input JSON")).toHaveValue(
      /target\.surface-anchor/u,
    );
    await expect(page.getByLabel("Tool input JSON")).toHaveValue(
      /assistant\.pointing/u,
    );

    await page.getByRole("button", { name: "Run all fixtures" }).click();
    const results = page.getByRole("list", { name: "Dev fixture results" });
    await expect(results.locator("li")).toHaveCount(13, { timeout: 30_000 });
    await expect(results.locator('[data-status="failed"]')).toHaveCount(0);
    await expect(
      results.locator(
        '[data-tool-name="control_teaching_scene"][data-status="cancelled"]',
      ),
    ).toHaveCount(1);
    await expect(
      page.getByRole("status").filter({ hasText: '"accepted": 13' }),
    ).toBeVisible();

    const reference = page.locator(
      '[data-interaction-anchor="anchor.reference-panel"]',
    );
    await expect(reference).toBeVisible();
    await expect(reference).toContainText("Dev Panel reference");
    await expect(reference).toContainText("const lessonReady = true;");
    await expect(
      page.locator('[data-interaction-anchor="anchor.learning-plan"]'),
    ).toContainText("Verify the fixture");
    const accessibility = await new AxeBuilder({ page })
      .include('[data-slot="webmcp-dev-panel"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      accessibility.violations,
      JSON.stringify(accessibility.violations, null, 2),
    ).toEqual([]);
    await testInfo.attach("lessonique-webmcp-dev-panel", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
  });

  test("runs the responsive menu HTML, CSS, and JavaScript scenes from the Dev Panel", async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    test.skip(testInfo.project.name !== "desktop-chromium");
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
    await challengeFixtures.getByRole("button", {
      name: /Set up responsive menu/u,
    }).click();
    await expect(invocationResult).toContainText('"stageId": "setup"');
    await expect(invocationResult).toContainText('"accepted": true');
    await expect(getWorkspaceTab(page, "index.html")).toBeVisible();
    await expect(getWorkspaceTab(page, "styles.css")).toBeVisible();
    await expect(getWorkspaceTab(page, "script.js")).toBeVisible();
    await expect(
      page.locator('[data-interaction-anchor="anchor.learning-plan"]'),
    ).toContainText("Create the navigation structure");

    await challengeFixtures.getByRole("button", {
      name: /Run HTML scene/u,
    }).click();
    await expect(invocationResult).toContainText('"stageId": "html"');
    await expect(invocationResult).toContainText('"accepted": true');
    const guide = page.getByLabel("Teaching guide");
    await expect(guide).toContainText("Start with meaningful structure");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(guide).toContainText("Inspect the navigation landmark");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(guide).toContainText("Confirm the structure in context", {
      timeout: 30_000,
    });
    await expect(guide).toContainText("normalized interaction");
    const preview = page.frameLocator("[data-preview-viewport]:visible iframe");
    await expect(page.locator(".sp-loading:visible")).toHaveCount(0, {
      timeout: 30_000,
    });
    await preview.getByRole("button", { name: "Explore routes" }).click();
    await expect(page.getByLabel("Lessonique visual guidance")).toHaveCount(0, {
      timeout: 5_000,
    });

    await challengeFixtures.getByRole("button", {
      name: /Run CSS and mobile scene/u,
    }).click();
    await expect(invocationResult).toContainText('"stageId": "css"');
    await expect(invocationResult).toContainText('"accepted": true');
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(guide).toContainText("Follow the control into the mobile preview", {
      timeout: 30_000,
    });
    await expect(page.locator("[data-preview-viewport]:visible")).toHaveAttribute(
      "data-preview-viewport",
      "mobile",
    );

    const paused = await invokeSceneControl(
      page,
      "pause",
      "scene.responsive-menu-css",
    );
    expect(paused).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({ sceneStatus: "paused" }),
      }),
    );
    await expect
      .poll(() => previewMenuTargetAlignmentDelta(page))
      .toBeLessThanOrEqual(2);
    await expect
      .poll(async () => (await previewMenuGuidanceTargetOverlap(page)).area)
      .toBe(0);

    await page.setViewportSize({ width: 1180, height: 820 });
    await expect
      .poll(() => previewMenuTargetAlignmentDelta(page))
      .toBeLessThanOrEqual(2);
    await expect
      .poll(async () => {
        const guideBox = await guide.boundingBox();
        if (!guideBox) return Number.POSITIVE_INFINITY;
        return Math.max(
          0,
          -guideBox.x,
          -guideBox.y,
          guideBox.x + guideBox.width - 1181,
          guideBox.y + guideBox.height - 821,
        );
      })
      .toBeLessThanOrEqual(1);
    await expect
      .poll(async () => (await previewMenuGuidanceTargetOverlap(page)).area)
      .toBe(0);

    const resumed = await invokeSceneControl(
      page,
      "resume",
      "scene.responsive-menu-css",
    );
    expect(resumed).toEqual(expect.objectContaining({ ok: true }));
    await page.getByRole("button", { name: "Finish", exact: true }).click();
    await expect(page.getByLabel("Lessonique visual guidance")).toHaveCount(0, {
      timeout: 5_000,
    });

    await challengeFixtures.getByRole("button", {
      name: /Run JavaScript scene/u,
    }).click();
    await expect(invocationResult).toContainText('"stageId": "javascript"');
    await expect(invocationResult).toContainText('"accepted": true');
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(guide).toContainText("Run the registered interaction", {
      timeout: 30_000,
    });
    const menuButton = preview.getByRole("button", { name: "Menu" });
    await expect(menuButton).toHaveAttribute("aria-expanded", "false");
    await menuButton.click();
    await expect(menuButton).toHaveAttribute("aria-expanded", "true");
    await expect(preview.getByRole("navigation")).toHaveAttribute(
      "data-open",
      "true",
    );
    await expect(page.getByLabel("Lessonique visual guidance")).toHaveCount(0, {
      timeout: 5_000,
    });

    await challengeFixtures.getByRole("button", {
      name: /Preview warning fixture/u,
    }).click();
    await expect(invocationResult).toContainText('"stageId": "warning"');
    await expect(invocationResult).toContainText('"accepted": true');
    await expect(
      page.getByRole("status", { name: /Lessonique companion: warning/u }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(guide).toContainText("Preview bounded warning feedback");
    await page.getByRole("button", { name: "Finish", exact: true }).click();
    await expect(page.getByLabel("Lessonique visual guidance")).toHaveCount(0, {
      timeout: 10_000,
    });

    await challengeFixtures.getByRole("button", {
      name: /Validate and close responsive menu/u,
    }).click();
    await expect(invocationResult).toContainText('"stageId": "complete"');
    await expect(invocationResult).toContainText('"accepted": true');
    await expect(
      page.getByRole("status", { name: /Lessonique companion: success/u }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(guide).toContainText("Celebrate verified behavior");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(guide).toContainText("Return to the completed plan", {
      timeout: 10_000,
    });
    await expect(
      page.getByRole("status", { name: /Lessonique companion: idle/u }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Finish", exact: true }).click();
    await expect(page.getByLabel("Lessonique visual guidance")).toHaveCount(0, {
      timeout: 10_000,
    });
    await testInfo.attach("lessonique-responsive-menu-mobile-scene", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
  });

  test("replaces the class with the Array.map JavaScript Console demo without reloading", async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    test.skip(testInfo.project.name !== "desktop-chromium");
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
    await challengeFixtures.getByRole("button", {
      name: /Set up responsive menu/u,
    }).click();
    await expect(invocationResult).toContainText('"accepted": true');
    await expect(getWorkspaceTab(page, "index.html")).toBeVisible();
    await page.evaluate(() => {
      (window as unknown as { __lessoniqueDemoMarker?: string })
        .__lessoniqueDemoMarker = "preserved";
    });

    await challengeFixtures.getByRole("button", {
      name: /Run Array\.map\(\) demo/u,
    }).click();
    await expect(invocationResult).toContainText('"stageId": "array-map"');
    await expect(invocationResult).toContainText('"accepted": true');
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { __lessoniqueDemoMarker?: string })
            .__lessoniqueDemoMarker,
      ),
    ).toBe("preserved");
    await expect(
      page.getByRole("combobox", { name: "Environment profile" }),
    ).toHaveValue("profile.javascript-console");
    await expect(getWorkspaceTab(page, "script.js")).toBeVisible();
    await expect(getWorkspaceTab(page, "index.html")).toHaveCount(0);
    await expect(getWorkspaceTab(page, "styles.css")).toHaveCount(0);

    const guide = page.getByLabel("Teaching guide");
    await expect(guide).toContainText("Transform every item with map", {
      timeout: 15_000,
    });
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(guide).toContainText("Read the validated console output", {
      timeout: 15_000,
    });
    const consoleSurface = page.locator(
      '[data-interaction-anchor="anchor.workspace-console"]',
    );
    await expect(consoleSurface).toBeVisible();
    await expect(consoleSurface).toContainText("Scaled scores: 6, 10, 16", {
      timeout: 15_000,
    });
    await expect(guide).toContainText("Keep the validated result", {
      timeout: 15_000,
    });
    await expect(
      page.getByRole("status", { name: /Lessonique companion: success/u }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Finish", exact: true }).click();
    await expect(page.getByLabel("Lessonique visual guidance")).toHaveCount(0, {
      timeout: 10_000,
    });
    await testInfo.attach("lessonique-array-map-console-scene", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
  });

  test("adapts the plan and replaces a reference through ChatGPT-registered tools", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium");
    await expect(
      page.getByRole("combobox", { name: "Environment profile" }),
    ).toBeEnabled();

    const results = await page.evaluate(async () => {
      const tools = (
        window as unknown as {
          __lessoniqueRegisteredTools: Array<{
            name: string;
            execute: (input: unknown) => Promise<unknown>;
          }>;
        }
      ).__lessoniqueRegisteredTools;
      const invoke = (name: string, input: unknown) =>
        tools.find((tool) => tool.name === name)?.execute(input);
      const created = await invoke("create_guided_lesson", {
        lessonId: "lesson.chatgpt-adaptation",
        lessonMode: "mixed",
        title: "ChatGPT adaptation fixture",
        objective: "Adapt a plan and present one structured reference.",
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
            content: "const adaptationReady = true;",
          },
        ],
        steps: [
          {
            id: "step.chatgpt-initial",
            title: "Create the value",
            objective: "Define the requested JavaScript value.",
          },
        ],
      });
      const updated = await invoke("update_lesson_plan", {
        operations: [
          {
            type: "insert_step",
            afterStepId: "step.chatgpt-initial",
            step: {
              id: "step.chatgpt-review",
              title: "Review the adaptation",
              objective: "Confirm the new plan step is visible.",
            },
          },
          {
            type: "set_active_step",
            stepId: "step.chatgpt-review",
          },
          {
            type: "set_agent_message",
            message: "ChatGPT adapted the plan without recreating the lesson.",
          },
        ],
      });
      const firstReference = await invoke("show_reference_panel", {
        referenceId: "reference.chatgpt",
        title: "Initial reference",
        content: "This content will be replaced.",
        focus: true,
      });
      const replacedReference = await invoke("show_reference_panel", {
        referenceId: "reference.chatgpt",
        title: "Updated reference",
        content: "The same reference ID now contains the updated explanation.",
        snippets: [
          {
            languageId: "language.javascript",
            code: "const adaptationReady = true;",
          },
        ],
      });
      return { created, updated, firstReference, replacedReference };
    });

    expect(results).toEqual({
      created: expect.objectContaining({ ok: true }),
      updated: expect.objectContaining({
        ok: true,
        data: expect.objectContaining({
          activeStepId: "step.chatgpt-review",
        }),
      }),
      firstReference: expect.objectContaining({ ok: true }),
      replacedReference: expect.objectContaining({
        ok: true,
        data: expect.objectContaining({ replaced: true }),
      }),
    });
    await expect(
      page.locator('[data-interaction-anchor="anchor.learning-plan"]'),
    ).toContainText("Review the adaptation");
    const reference = page.locator('[data-reference-id="reference.chatgpt"]');
    await expect(reference).toHaveCount(1);
    await expect(reference).toContainText("Updated reference");
    await expect(reference).toContainText(
      "The same reference ID now contains the updated explanation.",
    );
    await expect(reference).not.toContainText("This content will be replaced.");

    const hidden = await page.evaluate(async () => {
      const tools = (
        window as unknown as {
          __lessoniqueRegisteredTools: Array<{
            name: string;
            execute: (input: unknown) => Promise<unknown>;
          }>;
        }
      ).__lessoniqueRegisteredTools;
      return tools
        .find(({ name }) => name === "configure_learning_environment")
        ?.execute({ surfaces: [{ id: "reference", visible: false }] });
    });
    expect(hidden).toEqual(expect.objectContaining({ ok: true }));
    await expect(reference).toHaveCount(0);
  });

  test("reconfigures the rendered workspace transactionally through WebMCP", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium");

    const profile = page.getByRole("combobox", { name: "Environment profile" });
    await expect(profile).toBeEnabled();
    const preview = page.locator("[data-preview-viewport]:visible");
    await expect(preview).toHaveAttribute("data-preview-viewport", "desktop");

    const validResult = await page.evaluate(async () => {
      const tools = (
        window as unknown as {
          __lessoniqueRegisteredTools: Array<{
            name: string;
            execute: (input: unknown) => Promise<unknown>;
          }>;
        }
      ).__lessoniqueRegisteredTools;
      return tools
        .find(({ name }) => name === "configure_learning_environment")
        ?.execute({
          activeFile: "script.js",
          activeSurfaceId: "editor",
          viewport: "mobile",
          transition: "animated",
          surfaces: [
            {
              id: "editor",
              options: [{ optionId: "editor.font-size", value: 18 }],
            },
          ],
        });
    });

    expect(validResult).toEqual(
      expect.objectContaining({
        ok: true,
        status: "completed",
        revision: expect.any(Number),
        data: expect.objectContaining({
          profileId: "profile.vanilla-web",
          activeFile: "script.js",
          activeSurfaceId: "editor",
          transition: "animated",
          evidence: expect.objectContaining({
            environmentRevision: expect.any(Number),
          }),
        }),
      }),
    );
    await expect(preview).toHaveAttribute("data-preview-viewport", "mobile");
    await expect(getWorkspaceTab(page, "script.js")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.locator(".monaco-editor .view-lines")).toHaveCSS(
      "font-size",
      "18px",
    );

    const invalidResult = await page.evaluate(async () => {
      const tools = (
        window as unknown as {
          __lessoniqueRegisteredTools: Array<{
            name: string;
            execute: (input: unknown) => Promise<unknown>;
          }>;
        }
      ).__lessoniqueRegisteredTools;
      return tools
        .find(({ name }) => name === "configure_learning_environment")
        ?.execute({
          viewport: "desktop",
          surfaces: [
            {
              id: "editor",
              options: [{ optionId: "editor.font-size", value: 200 }],
            },
          ],
        });
    });

    expect(invalidResult).toEqual(
      expect.objectContaining({
        ok: false,
        status: "failed",
        error: expect.objectContaining({
          code: "invalid_capability_input",
          recoverable: true,
        }),
      }),
    );
    await expect(preview).toHaveAttribute("data-preview-viewport", "mobile");
    await expect(page.locator(".monaco-editor .view-lines")).toHaveCSS(
      "font-size",
      "18px",
    );
  });

  test("navigates nested workspace files through the searchable Project Files panel", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium");
    await expect(
      page.getByRole("combobox", { name: "Environment profile" }),
    ).toBeEnabled();

    const result = await page.evaluate(async () => {
      const tools = (
        window as unknown as {
          __lessoniqueRegisteredTools: Array<{
            name: string;
            execute: (input: unknown) => Promise<unknown>;
          }>;
        }
      ).__lessoniqueRegisteredTools;
      return tools.find(({ name }) => name === "apply_workspace_changes")?.execute({
        operations: [
          {
            type: "create_file",
            path: "src/components/header.html",
            content: "<header>Lessonique</header>",
          },
          {
            type: "create_file",
            path: "src/components/footer.html",
            content: "<footer>Keep learning</footer>",
          },
          {
            type: "create_file",
            path: "src/styles/theme.css",
            content: ":root { color-scheme: dark; }",
          },
        ],
        openAfter: "src/components/header.html",
      });
    });
    expect(result).toEqual(expect.objectContaining({ ok: true }));

    const panel = page.getByRole("complementary", { name: "Project Files" });
    const classroom = page.getByRole("main", { name: "Lessonique Classroom" });
    await expect(panel).toBeVisible();
    await expect(
      panel.getByRole("treeitem", { name: "lessonique-workspace", exact: true }),
    ).toHaveAttribute("aria-expanded", "true");
    await expect(panel.locator('[data-folder-path="src/components"]')).toBeVisible();

    const componentsFolder = panel.locator('[data-folder-path="src/components"]');
    const headerFile = panel.locator(
      '[data-file-path="src/components/header.html"]',
    );
    const footerFile = panel.locator(
      '[data-file-path="src/components/footer.html"]',
    );
    await componentsFolder.click();
    await expect(headerFile).toHaveCount(0);
    await componentsFolder.click();
    await expect(headerFile).toBeVisible();

    const initialClassroomHeight = await classroom.evaluate(
      (element) => element.getBoundingClientRect().height,
    );
    const search = panel.getByRole("searchbox", { name: "Search project files" });
    await page.keyboard.press("Control+K");
    await expect(search).toBeFocused();
    await search.fill("COMPONENTS/HEAD");
    await expect(headerFile).toBeVisible();
    await expect(footerFile).toHaveCount(0);
    await expect(panel.locator('[data-folder-path="src"]')).toBeVisible();
    await expect(componentsFolder).toBeVisible();

    await search.press("Escape");
    await expect(search).toHaveValue("");
    await footerFile.click();
    await expect(
      panel.getByRole("treeitem", {
        name: "src/components/footer.html",
        exact: true,
      }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(getWorkspaceTab(page, "src/components/footer.html")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      await classroom.evaluate(
        (element) => element.getBoundingClientRect().height,
      ),
    ).toBe(initialClassroomHeight);

    await page.getByRole("button", { name: "Toggle color theme" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/u);
    await testInfo.attach("lessonique-project-files-panel", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
  });

  test("manages Project Files inline and preserves draggable tab order", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium");
    await expect(
      page.getByRole("combobox", { name: "Environment profile" }),
    ).toBeEnabled();

    const initialLayout = await measureWorkspaceReflow(page);
    expect(Math.abs(initialLayout.bodyRight - initialLayout.contentRight)).toBeLessThanOrEqual(1);

    const resizeHandle = page.getByRole("separator", {
      name: "Resize project files panel",
    });
    await expect(resizeHandle).toHaveCSS("cursor", "col-resize");
    await expect(resizeHandle).toHaveAttribute("aria-valuenow", "256");
    await resizeHandle.press("End");
    await expect(resizeHandle).toHaveAttribute("aria-valuenow", "360");
    const maximumPanelLayout = await measureWorkspaceReflow(page);
    expect(maximumPanelLayout.contentWidth).toBeLessThan(initialLayout.contentWidth);
    expect(Math.abs(maximumPanelLayout.bodyRight - maximumPanelLayout.contentRight)).toBeLessThanOrEqual(1);
    await resizeHandle.press("Home");
    await expect(resizeHandle).toHaveAttribute("aria-valuenow", "208");
    const minimumPanelLayout = await measureWorkspaceReflow(page);
    expect(minimumPanelLayout.contentWidth).toBeGreaterThan(maximumPanelLayout.contentWidth);
    expect(Math.abs(minimumPanelLayout.bodyRight - minimumPanelLayout.contentRight)).toBeLessThanOrEqual(1);
    await resizeHandle.press("ArrowRight");
    await expect(resizeHandle).toHaveAttribute("aria-valuenow", "224");

    const resizeBounds = await resizeHandle.boundingBox();
    if (!resizeBounds) throw new Error("Project Files resize handle is missing.");
    await page.mouse.move(
      resizeBounds.x + resizeBounds.width / 2,
      resizeBounds.y + resizeBounds.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      resizeBounds.x + resizeBounds.width / 2 + 40,
      resizeBounds.y + resizeBounds.height / 2,
    );
    await page.mouse.up();
    await expect.poll(async () => Number(await resizeHandle.getAttribute("aria-valuenow"))).toBeGreaterThan(224);

    let panel = page.getByRole("complementary", { name: "Project Files" });
    const activeEntryRow = panel.locator('[data-project-entry-row="index.html"]');
    const fileTree = panel.getByRole("tree", { name: "Workspace file tree" });
    await activeEntryRow.hover();
    const [entryRowBounds, fileTreeBounds] = await Promise.all([
      activeEntryRow.boundingBox(),
      fileTree.boundingBox(),
    ]);
    if (!entryRowBounds || !fileTreeBounds) {
      throw new Error("Project Files row geometry is unavailable.");
    }
    expect(Math.abs(entryRowBounds.width - fileTreeBounds.width)).toBeLessThanOrEqual(1);
    await expect(activeEntryRow).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

    await getWorkspaceTab(page, "styles.css").click();
    await page.getByRole("button", { name: "Close file tab styles.css" }).click();
    await expect(getWorkspaceTab(page, "styles.css")).toHaveCount(0);
    await expect(getWorkspaceTab(page, "index.html")).toBeVisible();
    await expect(getWorkspaceTab(page, "script.js")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(panel.locator('[data-file-path="styles.css"]')).toBeVisible();
    await panel.locator('[data-file-path="styles.css"]').click();
    await expect(getWorkspaceTab(page, "styles.css")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const expandedLayout = await measureWorkspaceReflow(page);
    await page.getByRole("button", { name: "Collapse project files" }).click();
    await expect(panel).toHaveCount(0);
    const collapsedLayout = await measureWorkspaceReflow(page);
    expect(collapsedLayout.contentWidth).toBeGreaterThan(expandedLayout.contentWidth);
    expect(Math.abs(collapsedLayout.bodyLeft - collapsedLayout.contentLeft)).toBeLessThanOrEqual(1);
    expect(Math.abs(collapsedLayout.bodyRight - collapsedLayout.contentRight)).toBeLessThanOrEqual(1);
    await page.getByRole("button", { name: "Expand project files" }).click();
    panel = page.getByRole("complementary", { name: "Project Files" });
    await expect(panel).toBeVisible();

    await expect(getWorkspaceTabOrder(page)).resolves.toEqual([
      "index.html",
      "script.js",
      "styles.css",
    ]);
    await getWorkspaceTabItem(page, "styles.css").dragTo(
      getWorkspaceTabItem(page, "index.html"),
      { targetPosition: { x: 4, y: 12 } },
    );
    const stableTabOrder = ["styles.css", "index.html", "script.js"];
    await expect(getWorkspaceTabOrder(page)).resolves.toEqual(stableTabOrder);

    await getWorkspaceTab(page, "index.html").click();
    const editor = page.getByRole("textbox", { name: "Workspace code editor" });
    await editor.press("Control+A");
    await page.keyboard.insertText(
      '<!doctype html><html lang="en"><body><main id="app">Stable tabs</main><script src="./script.js"></script></body></html>',
    );
    await page.waitForTimeout(350);
    await expect(getWorkspaceTabOrder(page)).resolves.toEqual(stableTabOrder);

    await panel.getByRole("button", { name: "Create file" }).click();
    let inlineInput = panel.getByRole("textbox", {
      name: "New file name in lessonique-workspace",
    });
    await expect(inlineInput).toBeFocused();
    await inlineInput.fill("temporary.js");
    await inlineInput.press("Escape");
    await expect(panel.locator('[data-file-path="temporary.js"]')).toHaveCount(0);

    await panel.getByRole("button", { name: "Create folder" }).click();
    inlineInput = panel.getByRole("textbox", {
      name: "New folder name in lessonique-workspace",
    });
    await expect(
      panel.locator('[data-inline-create-parent="lessonique-workspace"]'),
    ).toBeVisible();
    await inlineInput.fill("lessons");
    await inlineInput.press("Enter");
    const lessonsFolder = panel.locator('[data-folder-path="lessons"]');
    await expect(lessonsFolder).toBeVisible();
    if ((await lessonsFolder.getAttribute("aria-expanded")) === "false") {
      await lessonsFolder.click();
    }

    await lessonsFolder.click({ button: "right" });
    let contextMenu = page.getByRole("menu", {
      name: "Folder actions for lessons",
    });
    await expect(contextMenu.getByRole("menuitem")).toHaveText([
      "New File",
      "New Folder",
      "Rename",
      "Delete",
    ]);
    await contextMenu.getByRole("menuitem", { name: "New Folder" }).click();
    inlineInput = panel.getByRole("textbox", {
      name: "New folder name in lessons",
    });
    await expect(panel.locator('[data-inline-create-parent="lessons"]')).toBeVisible();
    await inlineInput.fill("empty");
    await inlineInput.press("Enter");
    await expect(panel.locator('[data-folder-path="lessons/empty"]')).toBeVisible();

    await panel.getByRole("button", { name: "Create file" }).click();
    inlineInput = panel.getByRole("textbox", {
      name: "New file name in lessonique-workspace",
    });
    await inlineInput.fill("notes.txt");
    await inlineInput.press("Enter");
    await expect(panel.getByRole("alert")).toContainText("must use one of");
    await inlineInput.press("Escape");

    await lessonsFolder.click({ button: "right" });
    contextMenu = page.getByRole("menu", {
      name: "Folder actions for lessons",
    });
    await contextMenu.getByRole("menuitem", { name: "New File" }).click();
    inlineInput = panel.getByRole("textbox", {
      name: "New file name in lessons",
    });
    await inlineInput.fill("intro.js");
    await inlineInput.press("Enter");
    await expect(getWorkspaceTab(page, "lessons/intro.js")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const orderWithNestedFile = [...stableTabOrder, "lessons/intro.js"];
    await expect(getWorkspaceTabOrder(page)).resolves.toEqual(orderWithNestedFile);

    const introFile = panel.locator('[data-file-path="lessons/intro.js"]');
    await introFile.click({ button: "right" });
    contextMenu = page.getByRole("menu", {
      name: "File actions for lessons/intro.js",
    });
    await expect(contextMenu.getByRole("menuitem")).toHaveText([
      "Rename",
      "Delete",
    ]);
    await contextMenu.getByRole("menuitem", { name: "Rename" }).click();
    inlineInput = panel.getByRole("textbox", {
      name: "Rename file lessons/intro.js",
    });
    await expect(inlineInput).toHaveValue("intro.js");
    await inlineInput.fill("cancelled.js");
    await inlineInput.press("Escape");
    await expect(introFile).toBeVisible();

    await introFile.click({ button: "right" });
    contextMenu = page.getByRole("menu", {
      name: "File actions for lessons/intro.js",
    });
    await contextMenu.getByRole("menuitem", { name: "Rename" }).click();
    inlineInput = panel.getByRole("textbox", {
      name: "Rename file lessons/intro.js",
    });
    await inlineInput.fill("lesson.js");
    await inlineInput.press("Enter");
    await expect(panel.locator('[data-file-path="lessons/lesson.js"]')).toBeVisible();
    await expect(panel.locator('[data-file-path="lessons/intro.js"]')).toHaveCount(0);
    await expect(getWorkspaceTabOrder(page)).resolves.toEqual([
      ...stableTabOrder,
      "lessons/lesson.js",
    ]);

    await lessonsFolder.click({ button: "right" });
    contextMenu = page.getByRole("menu", {
      name: "Folder actions for lessons",
    });
    await contextMenu.getByRole("menuitem", { name: "Rename" }).click();
    inlineInput = panel.getByRole("textbox", { name: "Rename folder lessons" });
    await inlineInput.fill("examples");
    await panel.getByText("Project Files", { exact: true }).click();
    const examplesFolder = panel.locator('[data-folder-path="examples"]');
    await expect(examplesFolder).toBeVisible();
    if ((await examplesFolder.getAttribute("aria-expanded")) === "false") {
      await examplesFolder.click();
    }
    await expect(panel.locator('[data-folder-path="examples/empty"]')).toBeVisible();
    await expect(panel.locator('[data-file-path="examples/lesson.js"]')).toBeVisible();
    await expect(getWorkspaceTab(page, "examples/lesson.js")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(getWorkspaceTabOrder(page)).resolves.toEqual([
      ...stableTabOrder,
      "examples/lesson.js",
    ]);

    const inspected = await page.evaluate(async () => {
      const tools = (
        window as unknown as {
          __lessoniqueRegisteredTools: Array<{
            name: string;
            execute: (input: unknown) => Promise<unknown>;
          }>;
        }
      ).__lessoniqueRegisteredTools;
      return tools.find(({ name }) => name === "inspect_classroom")?.execute({
        include: ["workspace"],
      });
    });
    expect(inspected).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          workspace: expect.objectContaining({
            directories: expect.arrayContaining(["examples", "examples/empty"]),
          }),
        }),
      }),
    );

    await page.reload();
    await expect(
      page.getByRole("combobox", { name: "Environment profile" }),
    ).toBeEnabled();
    panel = page.getByRole("complementary", { name: "Project Files" });
    const restoredExamplesFolder = panel.locator('[data-folder-path="examples"]');
    await expect(restoredExamplesFolder).toBeVisible();
    if ((await restoredExamplesFolder.getAttribute("aria-expanded")) === "false") {
      await restoredExamplesFolder.click();
    }
    await expect(panel.locator('[data-folder-path="examples/empty"]')).toBeVisible();
    await expect(panel.locator('[data-file-path="examples/lesson.js"]')).toBeVisible();

    const restoredLessonFile = panel.locator('[data-file-path="examples/lesson.js"]');
    await restoredLessonFile.click({ button: "right" });
    contextMenu = page.getByRole("menu", {
      name: "File actions for examples/lesson.js",
    });
    await contextMenu.getByRole("menuitem", { name: "Delete" }).click();
    let deleteDialog = page.getByRole("dialog", { name: "Delete file?" });
    await expect(deleteDialog).toContainText("examples/lesson.js");
    await expect(deleteDialog.getByRole("button")).toHaveText([
      "Cancel",
      "Delete",
    ]);
    const [deleteDialogBounds, viewportSize] = await Promise.all([
      deleteDialog.boundingBox(),
      Promise.resolve(page.viewportSize()),
    ]);
    if (!deleteDialogBounds || !viewportSize) {
      throw new Error("Delete confirmation geometry is unavailable.");
    }
    expect(deleteDialogBounds.width).toBeLessThanOrEqual(400);
    expect(
      Math.abs(
        deleteDialogBounds.x + deleteDialogBounds.width / 2 -
          viewportSize.width / 2,
      ),
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(
        deleteDialogBounds.y + deleteDialogBounds.height / 2 -
          viewportSize.height / 2,
      ),
    ).toBeLessThanOrEqual(2);
    await deleteDialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(restoredLessonFile).toBeVisible();
    await restoredLessonFile.click({ button: "right" });
    contextMenu = page.getByRole("menu", {
      name: "File actions for examples/lesson.js",
    });
    await contextMenu.getByRole("menuitem", { name: "Delete" }).click();
    deleteDialog = page.getByRole("dialog", { name: "Delete file?" });
    await deleteDialog.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(panel.locator('[data-file-path="examples/lesson.js"]')).toHaveCount(0);

    await restoredExamplesFolder.click({ button: "right" });
    contextMenu = page.getByRole("menu", {
      name: "Folder actions for examples",
    });
    await contextMenu.getByRole("menuitem", { name: "New File" }).click();
    inlineInput = panel.getByRole("textbox", { name: "New file name in examples" });
    await inlineInput.fill("nested.js");
    await inlineInput.press("Enter");
    await expect(panel.locator('[data-file-path="examples/nested.js"]')).toBeVisible();

    await restoredExamplesFolder.click({ button: "right" });
    contextMenu = page.getByRole("menu", {
      name: "Folder actions for examples",
    });
    await contextMenu.getByRole("menuitem", { name: "Delete" }).click();
    deleteDialog = page.getByRole("dialog", { name: "Delete folder?" });
    await expect(deleteDialog).toContainText("examples");
    await expect(deleteDialog).toContainText("every file and folder inside it");
    await deleteDialog.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(panel.locator('[data-folder-path="examples"]')).toHaveCount(0);
    await expect(getWorkspaceTab(page, "examples/nested.js")).toHaveCount(0);

    await testInfo.attach("lessonique-project-files-management", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
  });

  test("runs the complete reduced-motion companion scene through real WebMCP tools", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(
      page.locator('[data-interaction-anchor="anchor.learning-plan"]'),
    ).toBeVisible();

    const started = await page.evaluate(async () => {
      const tools = (
        window as unknown as {
          __lessoniqueRegisteredTools: Array<{
            name: string;
            execute: (input: unknown) => Promise<unknown>;
          }>;
        }
      ).__lessoniqueRegisteredTools;
      return tools.find(({ name }) => name === "play_teaching_scene")?.execute({
        id: "scene.browser-companion",
        allowManualNavigation: true,
        beats: [
          {
            id: "beat.browser-guide",
            type: "interaction",
            target: {
              resolverId: "target.surface-anchor",
              input: { anchorId: "anchor.learning-plan" },
            },
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
                input: { text: "Inspect this registered `learningPlan` target." },
              },
            ],
            guide: {
              title: "Responsive `semantic` guidance",
              body: "Keep this `const` line.\nRender `<section>` on the second line.",
              supportingItems: [
                "First `string` item",
                "Second `boolean` item",
              ],
            },
            caption: "Visual `meaning` remains complete without motion or audio.",
            wait: {
              kind: "interaction",
              eventTypeId: "interaction.surface-activate",
              target: {
                resolverId: "target.surface-anchor",
                input: { anchorId: "anchor.learning-plan" },
              },
              timeoutMs: 300_000,
            },
          },
        ],
      });
    });

    expect(started).toEqual(
      expect.objectContaining({
        ok: true,
        status: "started",
        data: expect.objectContaining({
          sceneId: "scene.browser-companion",
          structuredGuideBeatIds: ["beat.browser-guide"],
        }),
      }),
    );

    const overlay = page.getByLabel("Lessonique visual guidance");
    const companion = page.getByRole("status", {
      name: /Lessonique companion:/,
    });
    const guide = page.getByLabel("Teaching guide");
    await expect(overlay).toHaveAttribute("data-reduced-motion", "true");
    await expect(companion.locator(".companion-character-stage")).toHaveCSS(
      "animation-name",
      "none",
    );
    await expect(companion.locator(".companion-blink-mask").first()).toHaveCSS(
      "animation-name",
      "none",
    );
    await expect(companion).toHaveAttribute(
      "data-assistant-state",
      "assistant.waiting",
    );
    await expect(companion).toHaveAttribute(
      "data-companion-visual-state",
      "idle",
    );
    await expect(companion).toHaveAttribute("data-companion-asset", "normal");
    await expect(guide).toContainText("Responsive semantic guidance");
    await expect(guide).toContainText("Keep this const line.");
    await expect(guide).toContainText("Render <section> on the second line.");
    await expect(guide).toContainText(
      "Visual meaning remains complete without motion or audio.",
    );
    const guideText = await guide.textContent();
    expect(guideText?.indexOf("First string item")).toBeLessThan(
      guideText?.indexOf("Second boolean item") ?? -1,
    );
    await expect(guide.locator('[data-slot="guide-inline-code"]')).toHaveCount(6);
    await expect(guide.locator("code")).toHaveText([
      "semantic",
      "const",
      "<section>",
      "string",
      "boolean",
      "meaning",
    ]);
    await expect(overlay).toHaveCSS("pointer-events", "none");
    for (const effect of ["focus", "spotlight", "highlight", "point"]) {
      await expect(
        page.locator(`[data-guidance-effect="${effect}"]`),
      ).toHaveCount(0);
    }

    await page.setViewportSize({ width: 1366, height: 900 });
    await expect(
      page.locator('[data-interaction-anchor="anchor.learning-plan"]'),
    ).toBeInViewport();
    const guideBox = await guide.boundingBox();
    expect(guideBox).not.toBeNull();
    expect(guideBox!.x).toBeGreaterThanOrEqual(0);
    expect(guideBox!.y).toBeGreaterThanOrEqual(0);
    expect(guideBox!.x + guideBox!.width).toBeLessThanOrEqual(1366);
    expect(guideBox!.y + guideBox!.height).toBeLessThanOrEqual(900);
    await expect
      .poll(async () => (await guidanceTargetOverlap(page)).area)
      .toBe(0);

    const accessibility = await new AxeBuilder({ page })
      .include('[data-slot="assistant-overlay-host"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      accessibility.violations,
      JSON.stringify(accessibility.violations, null, 2),
    ).toEqual([]);
    await testInfo.attach("lessonique-companion-scene", {
      body: await page.screenshot(),
      contentType: "image/png",
    });

    const pause = await invokeSceneControl(page, "pause");
    expect(pause).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({ sceneStatus: "paused" }),
      }),
    );
    await expect(guide).toContainText("Paused");
    const resume = await invokeSceneControl(page, "resume");
    expect(resume).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({ sceneStatus: "waiting" }),
      }),
    );

    await page
      .locator('[data-interaction-anchor="anchor.learning-plan"]')
      .click();
    await expect(overlay).toHaveCount(0);
    const inspected = await page.evaluate(async () => {
      const tools = (
        window as unknown as {
          __lessoniqueRegisteredTools: Array<{
            name: string;
            execute: (input: unknown) => Promise<unknown>;
          }>;
        }
      ).__lessoniqueRegisteredTools;
      return tools.find(({ name }) => name === "inspect_classroom")?.execute({
        include: ["scene", "assistant"],
      });
    });
    expect(inspected).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          scene: expect.objectContaining({
            status: "completed",
            activeSceneId: "scene.browser-companion",
            activeTarget: null,
          }),
          assistant: expect.objectContaining({
            stateId: "assistant.idle",
            visible: false,
          }),
        }),
      }),
    );
    expect(JSON.stringify(inspected)).not.toMatch(/geometry|selector|domnode/iu);
  });

  test("repositions the companion between distinct targets without overlaps", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium");
    await page.setViewportSize({ width: 1440, height: 900 });

    const created = await invokeRegisteredTool(page, "create_guided_lesson", {
      lessonId: "lesson.directional-companion",
      lessonMode: "explain",
      title: "Directional companion lesson",
      objective: "Verify target-aware companion movement and guidance.",
      environment: {
        profileId: "profile.vanilla-web",
        languageIds: [
          "language.html",
          "language.css",
          "language.javascript",
        ],
        activeFile: "direction.html",
        activeSurfaceId: "editor",
      },
      files: [
        {
          path: "direction.html",
          languageId: "language.html",
          content: '<main class="lesson-card">Directional guidance</main>',
        },
        {
          path: "direction.css",
          languageId: "language.css",
          content: ".lesson-card { padding: 2rem; }",
        },
        {
          path: "direction.js",
          languageId: "language.javascript",
          content: "console.log('directional companion ready');",
        },
      ],
      steps: [
        {
          id: "step.directional-companion",
          title: "Follow the companion",
          objective: "Observe directional visual guidance.",
        },
      ],
    });
    expect(created).toEqual(expect.objectContaining({ ok: true }));
    await expect(getWorkspaceTab(page, "direction.html")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const codeTarget = {
      resolverId: "target.code-range",
      input: {
        filePath: "direction.html",
        startLine: 1,
        startColumn: 1,
        endLine: 1,
        endColumn: 7,
      },
    };
    const consoleTarget = {
      resolverId: "target.surface-anchor",
      input: { anchorId: "anchor.workspace-console" },
    };
    const started = await invokeRegisteredTool(page, "play_teaching_scene", {
      id: "scene.directional-companion",
      allowManualNavigation: true,
      cleanupPolicy: "replace",
      beats: [
        {
          id: "beat.directional-code",
          type: "explanation",
          prepare: {
            surfaceId: "editor",
            filePath: "direction.html",
            scroll: "if-needed",
          },
          target: codeTarget,
          assistant: {
            stateId: "assistant.pointing",
            placementId: "placement.near-target",
            visible: true,
          },
          effects: [
            { effectId: "effect.focus" },
            { effectId: "effect.pointer" },
          ],
          guide: {
            title: "Point toward the code",
            body: "The companion stays closest to the active code target.",
          },
        },
        {
          id: "beat.directional-console",
          type: "explanation",
          target: consoleTarget,
          assistant: {
            stateId: "assistant.pointing",
            placementId: "placement.near-target",
            visible: true,
          },
          effects: [
            { effectId: "effect.focus" },
            { effectId: "effect.pointer" },
          ],
          guide: {
            title: "Cross to the runtime console",
            body: "The companion changes sides and keeps facing the explanation target.",
          },
        },
      ],
    });
    expect(started).toEqual(expect.objectContaining({ ok: true, status: "started" }));

    const presentation = page.locator("[data-assistant-side]");
    const companion = page.getByRole("status", {
      name: /Lessonique companion:/,
    });
    const guide = page.getByLabel("Teaching guide");
    await expect(guide).toContainText("Point toward the code");
    const firstSide = await presentation.getAttribute("data-assistant-side");
    const firstFacing = await presentation.getAttribute("data-assistant-facing");
    expect(firstSide).toMatch(/^(left|right|above|below|docked)$/u);
    expect(firstFacing).toMatch(/^(left|right)$/u);
    await expect(companion).toHaveAttribute("data-assistant-facing", firstFacing!);
    await expect(companion).toHaveAttribute("data-pointing-arm", firstFacing!);
    await expect(companion).toHaveAttribute(
      "data-companion-visual-state",
      "guiding",
    );
    await expect(companion).toHaveAttribute("data-companion-asset", "normal");
    await expect(companion.locator(".companion-character-stage")).toHaveCSS(
      "animation-name",
      "lessonique-companion-float",
    );
    await expect(companion.locator(".companion-blink-mask").first()).toHaveCSS(
      "animation-name",
      "lessonique-companion-blink",
    );
    const firstTransform = await presentation.getAttribute("style");
    await testInfo.attach("lessonique-directional-companion-code", {
      body: await page.screenshot(),
      contentType: "image/png",
    });

    await invokeSceneControl(page, "next", "scene.directional-companion");
    await expect(guide).toContainText("Cross to the runtime console");
    const secondFacing = await presentation.getAttribute("data-assistant-facing");
    expect(secondFacing).toMatch(/^(left|right)$/u);
    await expect(companion).toHaveAttribute("data-assistant-facing", secondFacing!);
    await expect(companion).toHaveAttribute("data-pointing-arm", secondFacing!);
    await expect(companion.locator(".companion-state-spark")).toHaveCSS(
      "animation-name",
      "lessonique-companion-guide-spark",
    );
    expect(await presentation.getAttribute("style")).not.toBe(firstTransform);
    await expect
      .poll(() => guidanceFocusOverlap(page))
      .toBe(0);

    await testInfo.attach("lessonique-directional-companion-console", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
    await invokeSceneControl(page, "cancel", "scene.directional-companion");
    await expect(page.getByLabel("Lessonique visual guidance")).toHaveCount(0);
  });

  test("shows meaningful agent actions without anchor or tool telemetry", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium");
    const liveActivity = page.locator(
      '[data-interaction-anchor="anchor.live-activity"]',
    );
    await expect(liveActivity).toBeVisible();

    await liveActivity.click();
    await liveActivity.evaluate((element) => {
      element.setAttribute("tabindex", "-1");
      (element as HTMLElement).focus();
    });
    await invokeRegisteredTool(page, "get_system_capabilities", {
      include: ["limits"],
    });
    await invokeRegisteredTool(page, "inspect_classroom", {
      include: ["activity"],
    });
    await invokeRegisteredTool(page, "apply_workspace_changes", {
      operations: [
        {
          type: "create_file",
          path: "timeline.js",
          content: "const visible = true;",
        },
      ],
      openAfter: "timeline.js",
    });
    for (const content of ["const visible = false;", "const visible = true;"]) {
      await invokeRegisteredTool(page, "apply_workspace_changes", {
        operations: [
          {
            type: "replace_file",
            path: "timeline.js",
            content,
          },
        ],
      });
    }
    await invokeRegisteredTool(page, "execute_environment_action", {
      actionId: "runtime.run",
    });

    await expect(
      liveActivity.locator('[data-activity-kind="file"]').filter({
        hasText: "ChatGPT created and opened timeline.js",
      }),
    ).toHaveCount(1);
    await expect(
      liveActivity.locator('[data-activity-kind="file"]').filter({
        hasText: "ChatGPT updated timeline.js",
      }),
    ).toHaveCount(1);
    await expect(
      liveActivity.locator('[data-activity-kind="execution"]').filter({
        hasText: "ChatGPT ran the active workspace",
      }),
    ).toHaveCount(1);
    await expect(
      liveActivity.locator('[data-slot="activity-inline-code"]'),
    ).toContainText(["timeline.js", "timeline.js"]);
    await expect(
      liveActivity.locator('[data-activity-source="agent"]').last(),
    ).toContainText("AI");
    await expect(liveActivity).not.toContainText("Registered interface anchor");
    await expect(liveActivity).not.toContainText("get_system_capabilities");
    await expect(liveActivity).not.toContainText("inspect_classroom");
    expect(await liveActivity.locator("li").count()).toBeLessThanOrEqual(8);
  });

  test("keeps guide sections, continuous highlights, Finish, resume, and drag overrides synchronized", async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    test.skip(testInfo.project.name !== "desktop-chromium");
    await page.setViewportSize({ width: 1440, height: 900 });

    const code = [
      "// Variables store values under a name.",
      `const studentName = "Gilbert"; // ${"wide-code ".repeat(20)}`,
      "let completedLessons = 0;",
      "completedLessons = completedLessons + 1;",
      "function greetStudent(name) {",
      "  return `Hello, ${name}!`;",
      "}",
      "const add = (firstNumber, secondNumber) => firstNumber + secondNumber;",
      "const double = (number) => number * 2;",
      "const course = {",
      '  title: "JavaScript Foundations",',
      '  level: "beginner",',
      "};",
      "console.log(greetStudent(studentName), add(2, 3), double(4), course);",
      ...Array.from({ length: 32 }, (_, index) => `// filler ${index + 1}`),
    ].join("\n");
    const planSections = [
      ["step.variables", "Variables"],
      ["step.functions", "Functions"],
      ["step.arrows", "Arrow functions"],
      ["step.objects", "Object literals"],
      ["step.together", "Everything together"],
    ] as const;
    const created = await invokeRegisteredTool(page, "create_guided_lesson", {
      lessonId: "lesson.guidance-synchronization",
      lessonMode: "explain",
      title: "JavaScript foundations",
      objective: "Verify synchronized visual guidance.",
      environment: {
        profileId: "profile.javascript-console",
        languageIds: ["language.javascript"],
        activeFile: "index.js",
        activeSurfaceId: "editor",
      },
      files: [
        {
          path: "index.js",
          languageId: "language.javascript",
          content: code,
          readOnly: true,
        },
      ],
      steps: planSections.map(([id, title]) => ({
        id,
        title,
        objective: `Understand ${title.toLowerCase()}.`,
      })),
    });
    expect(created).toEqual(expect.objectContaining({ ok: true }));

    const ranges = [
      [1, 1, 1, 39, "step.variables", "Variables overview"],
      [2, 1, 4, 43, "step.variables", "Variables in detail"],
      [5, 1, 7, 2, "step.functions", "Function declaration"],
      [6, 3, 6, 29, "step.functions", "Function return"],
      [8, 1, 8, 73, "step.arrows", "Arrow function"],
      [9, 1, 9, 40, "step.arrows", "Implicit return"],
      [10, 1, 13, 3, "step.objects", "Object literal"],
      [11, 3, 12, 22, "step.objects", "Object properties"],
      [14, 1, 14, 78, "step.together", "Everything together"],
    ] as const;
    const started = await invokeRegisteredTool(page, "play_teaching_scene", {
      id: "scene.guidance-synchronization",
      cleanupPolicy: "replace",
      allowManualNavigation: true,
      beats: ranges.map(
        ([startLine, startColumn, endLine, endColumn, lessonStepId, title], index) => ({
          id: `beat.guidance-${index + 1}`,
          lessonStepId,
          type: "explanation",
          prepare: {
            surfaceId: "editor",
            filePath: "index.js",
            scroll: "if-needed",
          },
          target: {
            resolverId: "target.code-range",
            input: { filePath: "index.js", startLine, startColumn, endLine, endColumn },
          },
          assistant: {
            stateId: "assistant.pointing",
            placementId: "placement.near-target",
            visible: true,
          },
          effects: [{ effectId: "effect.highlight" }],
          guide: {
            title,
            body: `Guide micro-step ${index + 1} remains separate from the Learning Plan section count.`,
          },
        }),
      ),
    });
    expect(started).toEqual(expect.objectContaining({ ok: true, status: "started" }));

    const guide = page.getByLabel("Teaching guide");
    const highlight = page.locator('[data-guidance-effect="highlight"]');
    const plan = page.getByRole("region", { name: "Learning Plan" });
    const planStep = (id: string) =>
      page.locator(`[data-learning-plan-step-id=${JSON.stringify(id)}]`);
    await expect(guide).toContainText("Variables overview");
    await expect(guide).toContainText("Step 1 of 9");
    await expect(plan).toContainText("Step 1 of 5");
    await expect(planStep("step.variables")).toHaveAttribute(
      "data-learning-plan-state",
      "current",
    );
    await expect(highlight).toHaveCount(1);
    await expect(highlight).toHaveAttribute("data-guidance-shape", "continuous");
    await expect(highlight).toHaveAttribute("data-guidance-fragment-count", "1");
    await expect(highlight).toHaveAttribute(
      "data-guidance-highlight-appearance",
      "standalone",
    );
    await expect(highlight).toHaveAttribute("data-guidance-highlight-padding", "4");
    await expect(highlight).toHaveCSS("border-top-width", "2px");
    await expect(highlight).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(highlight).not.toHaveCSS("box-shadow", "none");

    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(guide).toContainText("Variables in detail");
    await expect(guide).toContainText("Step 2 of 9");
    await expect(planStep("step.variables")).toHaveAttribute(
      "data-learning-plan-state",
      "current",
    );
    await expect(highlight).toHaveCount(1);
    await expect(highlight).toHaveAttribute("data-guidance-fragment-count", "3");
    const initialHighlightBox = await highlight.boundingBox();
    expect(initialHighlightBox).not.toBeNull();
    await page.locator(".monaco-scrollable-element").first().evaluate((element) => {
      element.scrollTop += 12;
      element.scrollLeft += 40;
    });
    await expect(highlight).toHaveCount(1);
    await expect
      .poll(async () => (await highlight.boundingBox())?.y)
      .not.toBe(initialHighlightBox?.y);
    await expect(highlight).toHaveAttribute("data-guidance-shape", "continuous");

    const guideWrapper = page.locator('[data-slot="draggable-guide"]');
    const guideHandle = page.getByLabel("Move guide panel");
    const companionWrapper = page.locator('[data-slot="draggable-companion"]');
    await expect(guideHandle).toHaveCSS("cursor", "grab");
    await expect(companionWrapper).toHaveCSS("cursor", "grab");
    await dragBy(page, guideHandle, 48, 36, guideWrapper);
    await dragBy(page, companionWrapper, -44, 42, companionWrapper);
    await expect(guideWrapper).not.toHaveAttribute("data-manual-offset-x", "0");
    await expect(companionWrapper).not.toHaveAttribute("data-manual-offset-x", "0");

    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(guide).toContainText("Function declaration");
    await expect(guideWrapper).toHaveAttribute("data-manual-offset-x", "0");
    await expect(guideWrapper).toHaveAttribute("data-manual-offset-y", "0");
    await expect(companionWrapper).toHaveAttribute("data-manual-offset-x", "0");
    await expect(companionWrapper).toHaveAttribute("data-manual-offset-y", "0");
    await expect(planStep("step.variables")).toHaveAttribute(
      "data-learning-plan-state",
      "complete",
    );
    await expect(planStep("step.functions")).toHaveAttribute(
      "data-learning-plan-state",
      "current",
    );
    await expect(plan).toContainText("Step 2 of 5");

    await page.getByRole("button", { name: "Hide guide" }).click();
    await expect(page.getByLabel("Teaching guide")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Resume guide" })).toBeVisible();
    await expect(companionWrapper).toBeVisible();
    await dragBy(page, companionWrapper, 70, 50, companionWrapper);
    const hiddenPetBox = await companionWrapper.boundingBox();
    expect(hiddenPetBox).not.toBeNull();
    expect(hiddenPetBox!.x).toBeGreaterThanOrEqual(11);
    expect(hiddenPetBox!.y).toBeGreaterThanOrEqual(11);
    expect(hiddenPetBox!.x + hiddenPetBox!.width).toBeLessThanOrEqual(1429);
    expect(hiddenPetBox!.y + hiddenPetBox!.height).toBeLessThanOrEqual(889);
    await page.getByRole("button", { name: "Resume guide" }).click();
    await expect(guide).toContainText("Function declaration");
    await expect(guide).toContainText("Step 3 of 9");
    await expect(highlight).toHaveCount(1);
    await expect(companionWrapper).toHaveAttribute("data-manual-offset-x", "0");
    await expect(companionWrapper).toHaveAttribute("data-manual-offset-y", "0");

    await dragBy(page, guideHandle, -50, 28, guideWrapper);
    await dragBy(page, companionWrapper, 38, -30, companionWrapper);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(guide).toContainText("Function return");
    await expect(guideWrapper).toHaveAttribute("data-manual-offset-x", "0");
    await expect(companionWrapper).toHaveAttribute("data-manual-offset-x", "0");
    await dragBy(page, guideHandle, 46, -24, guideWrapper);
    await dragBy(page, companionWrapper, -32, 30, companionWrapper);
    await page.getByRole("button", { name: "Previous", exact: true }).click();
    await expect(guide).toContainText("Function declaration");
    await expect(guideWrapper).toHaveAttribute("data-manual-offset-x", "0");
    await expect(companionWrapper).toHaveAttribute("data-manual-offset-x", "0");
    await expect(planStep("step.functions")).toHaveAttribute(
      "data-learning-plan-state",
      "current",
    );

    for (const expectedTitle of [
      "Function return",
      "Arrow function",
      "Implicit return",
      "Object literal",
      "Object properties",
      "Everything together",
    ]) {
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await expect(guide).toContainText(expectedTitle);
    }
    await expect(guide).toContainText("Step 9 of 9");
    await expect(plan).toContainText("Step 5 of 5");
    await expect(planStep("step.together")).toHaveAttribute(
      "data-learning-plan-state",
      "current",
    );
    await expect(page.getByRole("button", { name: "Next", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Finish", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Finish", exact: true })).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "Validate Exercise", exact: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Finish", exact: true }).click();
    await expect(page.getByLabel("Lessonique visual guidance")).toHaveCount(0);
    await expect(plan).toContainText("Completed");
    for (const [id] of planSections) {
      await expect(planStep(id)).toHaveAttribute("data-learning-plan-state", "complete");
    }

    const persistentCompanion = page.locator('[data-slot="persistent-companion"]');
    const persistentContent = page.locator(
      '[data-slot="persistent-companion-content"]',
    );
    const resumeAfterCompletion = page.getByRole("button", {
      name: "Resume guide",
    });
    await expect(persistentCompanion).toBeVisible();
    await expect(persistentCompanion).toHaveCSS("cursor", "grab");
    await expect(resumeAfterCompletion).toBeVisible();
    await persistentCompanion.hover();
    await expect
      .poll(() =>
        persistentContent.evaluate(
          (element) => getComputedStyle(element).transform,
        ),
      )
      .not.toBe("none");

    await dragBy(page, persistentCompanion, -80, 54, persistentCompanion);
    const persistentBox = await persistentCompanion.boundingBox();
    expect(persistentBox).not.toBeNull();
    expect(persistentBox!.x).toBeGreaterThanOrEqual(11);
    expect(persistentBox!.y).toBeGreaterThanOrEqual(11);
    expect(persistentBox!.x + persistentBox!.width).toBeLessThanOrEqual(1429);
    expect(persistentBox!.y + persistentBox!.height).toBeLessThanOrEqual(889);

    await resumeAfterCompletion.click();
    await expect(guide).toContainText("Variables overview");
    await expect(guide).toContainText("Step 1 of 9");
    await expect(resumeAfterCompletion).toHaveCount(0);
    await expect(plan).toContainText("Step 1 of 5");
    await expect(planStep("step.variables")).toHaveAttribute(
      "data-learning-plan-state",
      "current",
    );
  });

  test("gates final Finish with automatic and manual semantic exercise validation", async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    test.skip(testInfo.project.name !== "desktop-chromium");

    const created = await invokeRegisteredTool(page, "create_guided_lesson", {
      lessonId: "lesson.final-exercise-validation",
      lessonMode: "practice",
      title: "Final exercise validation",
      objective: "Create and call a JavaScript function.",
      environment: {
        profileId: "profile.javascript-console",
        languageIds: ["language.javascript"],
        activeFile: "index.js",
        activeSurfaceId: "editor",
      },
      files: [
        {
          path: "index.js",
          languageId: "language.javascript",
          content:
            'const favoriteColor = "blue";\n// Create and call describeFavorite here.\n',
        },
      ],
      steps: [
        {
          id: "step.exercise",
          title: "Your first function",
          objective: "Create and call describeFavorite.",
          criteria: [
            {
              id: "criterion.function",
              validatorId: "validator.javascript-function-exists",
              input: { filePath: "index.js", name: "describeFavorite" },
            },
            {
              id: "criterion.call",
              validatorId: "validator.javascript-call-exists",
              input: { filePath: "index.js", calleeName: "describeFavorite" },
            },
          ],
        },
      ],
      initialScene: {
        id: "scene.final-exercise-validation",
        cleanupPolicy: "replace",
        allowManualNavigation: true,
        beats: [
          {
            id: "beat.exercise",
            type: "interaction",
            lessonStepId: "step.exercise",
            prepare: {
              surfaceId: "editor",
              filePath: "index.js",
              scroll: "if-needed",
            },
            target: {
              resolverId: "target.code-range",
              input: {
                filePath: "index.js",
                startLine: 2,
                startColumn: 1,
                endLine: 2,
                endColumn: 43,
              },
            },
            effects: [],
            guide: {
              title: "Small coding challenge",
              body: "Create describeFavorite, return a sentence, and call it.",
            },
            wait: {
              kind: "interaction",
              eventTypeId: "interaction.editor-change",
              target: {
                resolverId: "target.code-range",
                input: {
                  filePath: "index.js",
                  startLine: 2,
                  startColumn: 1,
                  endLine: 2,
                  endColumn: 43,
                },
              },
              timeoutMs: 300_000,
            },
          },
        ],
      },
    });
    expect(created).toEqual(expect.objectContaining({ ok: true }));

    const guide = page.getByLabel("Teaching guide");
    const validate = page.getByRole("button", {
      name: "Validate Exercise",
      exact: true,
    });
    const finish = page.getByRole("button", { name: "Finish", exact: true });
    const planStep = page.locator('[data-learning-plan-step-id="step.exercise"]');
    const editor = page.getByRole("textbox", { name: "Workspace code editor" });
    const replaceEditor = async (content: string) => {
      await editor.press("Control+A");
      await page.keyboard.insertText(content);
    };

    await expect(guide).toContainText("Small coding challenge");
    await expect(validate).toBeVisible();
    await expect(finish).toBeDisabled();
    await validate.click();
    await expect(guide.getByRole("status")).toContainText(
      "0 of 2 requirements passed.",
    );
    await expect(finish).toBeDisabled();

    const equivalentSolution = [
      'const favoriteColor = "green";',
      "const describeFavorite = (color) => `I like ${color}.`;",
      "console.log(describeFavorite(favoriteColor));",
    ].join("\n");
    await replaceEditor(equivalentSolution);
    await expect(guide.getByRole("status")).toContainText(
      "Exercise complete. Finish is now available.",
      { timeout: 10_000 },
    );
    await expect(finish).toBeEnabled();

    await replaceEditor(`${equivalentSolution}\n// This unrelated comment keeps the solution valid.`);
    await expect(finish).toBeEnabled();
    await page.waitForTimeout(700);
    await expect(finish).toBeEnabled();

    await replaceEditor(
      'const describeFavorite = (color) => `I like ${color}.`;',
    );
    await expect(guide.getByRole("status")).toContainText(
      "1 of 2 requirements passed.",
      { timeout: 10_000 },
    );
    await expect(finish).toBeDisabled();

    await replaceEditor(equivalentSolution);
    await validate.click();
    await expect(finish).toBeEnabled({ timeout: 10_000 });
    await finish.click();

    await expect(page.getByLabel("Lessonique visual guidance")).toHaveCount(0);
    await expect(planStep).toHaveAttribute("data-learning-plan-state", "complete");
    await expect(page.getByRole("region", { name: "Learning Plan" })).toContainText(
      "Completed",
    );
    const inspection = await invokeRegisteredTool(page, "inspect_classroom", {
      include: ["lesson", "scene"],
    });
    expect(inspection).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({
          lesson: expect.objectContaining({
            status: "completed",
            progress: expect.objectContaining({ percentage: 100 }),
          }),
          scene: expect.objectContaining({ status: "completed" }),
        }),
      }),
    );
  });

  test("preserves exact Monaco token, line, and contiguous range anchors through navigation and layout changes", async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    test.skip(testInfo.project.name !== "desktop-chromium");
    await page.setViewportSize({ width: 1440, height: 900 });

    const edgeToken = "RIGHT_EDGE";
    const edgeLine = `const horizontalPadding = "${"x".repeat(140)}${edgeToken}";`;
    const edgeStartColumn = edgeLine.indexOf(edgeToken) + 1;
    const code = [
      'const courseName = "JavaScript";',
      "let lessonCount = 3;",
      "let isInteractive = true;",
      "const nextTopic = null;",
      "",
      "const profile = {",
      '  level: "beginner",',
      "  active: true,",
      "};",
      ...Array.from({ length: 32 }, (_, index) => `// scroll filler ${index + 1}`),
      edgeLine,
    ].join("\n");
    const lessonSteps = [
      ["step.overview", "Variable overview"],
      ["step.declarations", "Declaration keywords"],
      ["step.assignments", "Identifiers and values"],
      ["step.objects", "Object ranges"],
      ["step.edges", "Viewport edges"],
    ] as const;
    const anchors = [
      ["single-line", "One exact line", 1, 1, 1, 33, "step.overview"],
      ["multi-line", "One four-line block", 1, 1, 4, 24, "step.overview"],
      ["const-token", "The `const` token", 1, 1, 1, 6, "step.declarations"],
      ["let-token", "The `let` token", 2, 1, 2, 4, "step.declarations"],
      ["course-name", "The courseName identifier", 1, 7, 1, 17, "step.assignments"],
      ["string-value", "The JavaScript value", 1, 20, 1, 32, "step.assignments"],
      ["lesson-count", "The lessonCount identifier", 2, 5, 2, 16, "step.assignments"],
      ["number-value", "The numeric value", 2, 19, 2, 20, "step.assignments"],
      ["object-block", "One object block", 6, 1, 8, 16, "step.objects"],
      [
        "edge-token",
        "The bottom-right token",
        42,
        edgeStartColumn,
        42,
        edgeStartColumn + edgeToken.length,
        "step.edges",
      ],
    ] as const;

    const created = await invokeRegisteredTool(page, "create_guided_lesson", {
      lessonId: "lesson.monaco-anchor-regression",
      lessonMode: "explain",
      title: "Precise Monaco anchors",
      objective: "Keep visual guidance synchronized with exact source ranges.",
      replaceExisting: true,
      environment: {
        profileId: "profile.javascript-console",
        languageIds: ["language.javascript"],
        activeFile: "variables.js",
        activeSurfaceId: "editor",
        surfaces: [
          {
            id: "editor",
            visible: true,
            options: [{ optionId: "editor.word-wrap", value: false }],
          },
          { id: "console", visible: true },
        ],
      },
      files: [
        {
          path: "variables.js",
          languageId: "language.javascript",
          content: code,
          readOnly: true,
        },
      ],
      steps: lessonSteps.map(([id, title]) => ({
        id,
        title,
        objective: `Verify ${title.toLowerCase()}.`,
      })),
      initialScene: {
        id: "scene.monaco-anchor-regression",
        cleanupPolicy: "replace",
        allowManualNavigation: true,
        beats: anchors.map(
          ([id, title, startLine, startColumn, endLine, endColumn, lessonStepId]) => ({
            id: `beat.${id}`,
            lessonStepId,
            type: "explanation",
            prepare: {
              surfaceId: "editor",
              filePath: "variables.js",
              scroll: "if-needed",
            },
            target: {
              resolverId: "target.code-range",
              input: {
                filePath: "variables.js",
                startLine,
                startColumn,
                endLine,
                endColumn,
              },
            },
            assistant: {
              stateId: "assistant.pointing",
              placementId: "placement.near-target",
              visible: true,
            },
            effects: [
              { effectId: "effect.spotlight" },
              { effectId: "effect.highlight" },
              { effectId: "effect.pointer" },
            ],
            guide: {
              title,
              body: `This beat measures only the ${id.replaceAll("-", " ")} target.`,
            },
          }),
        ),
      },
    });
    expect(created).toEqual(expect.objectContaining({ ok: true }));

    const guide = page.getByLabel("Teaching guide");
    const highlight = page.locator('[data-guidance-effect="highlight"]');
    const spotlight = page.locator('[data-guidance-effect="spotlight"]');
    const pointer = page.locator('[data-guidance-effect="point"]');
    const targetEndpoint = pointer.locator(
      '[data-guidance-connector-endpoint="target"]',
    );
    const connectorLine = pointer.locator(
      '[data-guidance-connector-line="true"]',
    );
    const editorScroller = page.locator(".monaco-scrollable-element").first();
    const editorRegion = page.locator(
      '[data-interaction-anchor="anchor.workspace-editor"]',
    );
    const next = () => page.getByRole("button", { name: "Next", exact: true }).click();
    const previous = () =>
      page.getByRole("button", { name: "Previous", exact: true }).click();
    const expectBeat = async (title: string, fragmentCount: number) => {
      await expect(guide).toContainText(title, { timeout: 15_000 });
      await expect(highlight).toHaveCount(1);
      await expect(highlight).toHaveAttribute("data-guidance-shape", "continuous");
      await expect(highlight).toHaveAttribute(
        "data-guidance-fragment-count",
        String(fragmentCount),
      );
      await expect(spotlight).toHaveCount(1);
      await expect(spotlight).toHaveAttribute(
        "data-guidance-spotlight-outline",
        "none",
      );
      await expect(highlight).toHaveAttribute(
        "data-guidance-highlight-appearance",
        "spotlight",
      );
      await expect(highlight).toHaveAttribute("data-guidance-highlight-padding", "0");
      await expect(pointer).toHaveCount(1);
      await expect(pointer).toHaveAttribute(
        "data-guidance-presentation",
        "guide-connector",
      );
      await expect(targetEndpoint).toHaveCount(1);
      await expect(connectorLine).toHaveAttribute("stroke-dasharray", "2 5");
      await expect.poll(() => codeGuidanceIsSafe(page)).toBe(true);
      await expect.poll(() => codeConnectorIsSafe(page)).toBe(true);
    };

    await expectBeat("One exact line", 1);
    await expect(connectorLine).toHaveAttribute("d", /\bQ\b/u);
    await expect.poll(() => companionIsBesideGuideOuterEdge(page)).toBe(true);
    const lineBox = await highlight.boundingBox();
    expect(lineBox).not.toBeNull();

    await next();
    await expectBeat("One four-line block", 4);
    const blockBox = await highlight.boundingBox();
    expect(blockBox).not.toBeNull();
    expect(blockBox!.height).toBeGreaterThan(lineBox!.height * 3);

    await next();
    await expectBeat("The const token", 1);
    const constBox = await highlight.boundingBox();
    expect(constBox).not.toBeNull();
    expect(constBox!.width).toBeLessThan(lineBox!.width / 3);
    await expect(highlight).toHaveCSS("border-top-width", "0px");
    await expect(highlight).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(highlight).toHaveClass(/shadow-none/u);
    await expect(guide.getByRole("button", { name: "Hide guide" })).toHaveText(
      "Hide",
    );
    await expect(guide.locator('code[data-slot="guide-inline-code"]')).toContainText(
      "const",
    );
    await expect.poll(() => companionIsBesideGuideOuterEdge(page)).toBe(true);

    await editorScroller.evaluate((element) => {
      element.scrollTop = 0;
      element.scrollLeft = 0;
    });
    await expect.poll(() => codeTargetNearEditorEdge(page, "top-left")).toBe(true);
    await expect.poll(() => codeGuidanceIsSafe(page)).toBe(true);
    const constVisualGeometry = await codeGuidanceGeometry(page);

    await next();
    await expectBeat("The let token", 1);
    const letBox = await highlight.boundingBox();
    expect(letBox).not.toBeNull();
    expect(letBox!.width).toBeLessThan(constBox!.width);

    await previous();
    await expectBeat("The const token", 1);
    await next();
    await expectBeat("The let token", 1);
    await previous();
    await expectBeat("The const token", 1);
    const returnedConstBox = await highlight.boundingBox();
    expect(returnedConstBox).not.toBeNull();
    expect(Math.abs(returnedConstBox!.x - constBox!.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(returnedConstBox!.width - constBox!.width)).toBeLessThanOrEqual(2);
    expectCodeGuidanceGeometryClose(
      await codeGuidanceGeometry(page),
      constVisualGeometry,
    );

    await editorScroller.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(page.getByLabel("Teaching guide paused")).toBeVisible({
      timeout: 10_000,
    });
    await expect(highlight).toHaveCount(0);
    await page.getByRole("button", { name: "Return to step" }).click();
    await expectBeat("The const token", 1);

    await next();
    await expectBeat("The let token", 1);
    await next();
    await expectBeat("The courseName identifier", 1);
    const identifierBox = await highlight.boundingBox();
    expect(identifierBox).not.toBeNull();
    expect(identifierBox!.width).toBeGreaterThan(constBox!.width);

    const projectFilesResizer = page.getByRole("separator", {
      name: "Resize project files panel",
    });
    const editorBeforeResize = await editorRegion.boundingBox();
    await projectFilesResizer.press("End");
    await expect
      .poll(async () => (await editorRegion.boundingBox())?.x)
      .not.toBe(editorBeforeResize?.x);
    await expectBeat("The courseName identifier", 1);
    await projectFilesResizer.press("Home");
    await expectBeat("The courseName identifier", 1);

    const verticalResizer = page.getByRole("separator", {
      name: "Resize editor and console panels",
    });
    const editorHeightBeforeResize = (await editorRegion.boundingBox())?.height;
    await verticalResizer.press("End");
    await expect
      .poll(async () => (await editorRegion.boundingBox())?.height)
      .not.toBe(editorHeightBeforeResize);
    await expectBeat("The courseName identifier", 1);
    await verticalResizer.press("Home");
    await expectBeat("The courseName identifier", 1);

    await next();
    await expectBeat("The JavaScript value", 1);
    const stringValueBox = await highlight.boundingBox();
    expect(stringValueBox).not.toBeNull();
    expect(stringValueBox!.width).toBeGreaterThan(identifierBox!.width);

    await next();
    await expectBeat("The lessonCount identifier", 1);
    const secondIdentifierBox = await highlight.boundingBox();
    expect(secondIdentifierBox).not.toBeNull();
    expect(secondIdentifierBox!.width).toBeGreaterThan(constBox!.width);

    await next();
    await expectBeat("The numeric value", 1);
    const numberValueBox = await highlight.boundingBox();
    expect(numberValueBox).not.toBeNull();
    expect(numberValueBox!.width).toBeLessThan(letBox!.width);

    await next();
    await expectBeat("One object block", 3);
    const objectBox = await highlight.boundingBox();
    expect(objectBox).not.toBeNull();
    expect(objectBox!.height).toBeGreaterThan(lineBox!.height * 2.2);

    await next();
    await expectBeat("The bottom-right token", 1);
    await editorScroller.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      element.scrollLeft = element.scrollWidth;
    });
    await expect.poll(() => codeTargetNearEditorEdge(page, "bottom-right")).toBe(true);
    await expect.poll(() => codeGuidanceIsSafe(page)).toBe(true);

    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(page.getByLabel("Teaching guide paused")).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole("button", { name: "Return to step" }).click();
    await expectBeat("The bottom-right token", 1);
    await expect.poll(() => codeGuidanceIsSafe(page)).toBe(true);
  });

  test("creates and resets the rendered classroom through the real WebMCP lifecycle", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium");

    await expect(page.getByRole("combobox", { name: "Environment profile" })).toBeEnabled();
    const created = await page.evaluate(async () => {
      const tools = (
        window as unknown as {
          __lessoniqueRegisteredTools: Array<{
            name: string;
            execute: (input: unknown) => Promise<unknown>;
          }>;
        }
      ).__lessoniqueRegisteredTools;
      return tools.find(({ name }) => name === "create_guided_lesson")?.execute({
        lessonId: "lesson.browser-fixture",
        lessonMode: "mixed",
        title: "Browser fixture lesson",
        objective: "Prove transactional bootstrap in the rendered classroom.",
        environment: {
          profileId: "profile.vanilla-web",
          languageIds: [
            "language.html",
            "language.css",
            "language.javascript",
          ],
          activeFile: "lesson.html",
          activeSurfaceId: "editor",
        },
        files: [
          {
            path: "lesson.html",
            languageId: "language.html",
            content: '<main id="lesson">Browser lesson</main>',
          },
          {
            path: "lesson.css",
            languageId: "language.css",
            content: "#lesson { color: rebeccapurple; }",
          },
          {
            path: "lesson.js",
            languageId: "language.javascript",
            content: "console.log('browser lesson ready');",
          },
        ],
        steps: [
          {
            id: "step.browser-1",
            title: "Create the structure",
            objective: "Add the semantic lesson structure.",
          },
          {
            id: "step.browser-2",
            title: "Style the result",
            objective: "Apply the requested presentation.",
          },
          {
            id: "step.browser-3",
            title: "Run the behavior",
            objective: "Verify the browser behavior.",
          },
        ],
      });
    });

    expect(created).toEqual(
      expect.objectContaining({
        ok: true,
        status: "completed",
        data: expect.objectContaining({
          lesson: expect.objectContaining({
            id: "lesson.browser-fixture",
            status: "active",
            activeStepId: "step.browser-1",
            stepCount: 3,
          }),
          environment: expect.objectContaining({
            profileId: "profile.vanilla-web",
            activeFile: "lesson.html",
            activeSurfaceId: "editor",
          }),
        }),
      }),
    );
    await expect(getWorkspaceTab(page, "lesson.html")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(getWorkspaceTab(page, "lesson.css")).toBeVisible();
    await expect(getWorkspaceTab(page, "lesson.js")).toBeVisible();

    const inspected = await page.evaluate(async () => {
      const tools = (
        window as unknown as {
          __lessoniqueRegisteredTools: Array<{
            name: string;
            execute: (input: unknown) => Promise<unknown>;
          }>;
        }
      ).__lessoniqueRegisteredTools;
      return tools.find(({ name }) => name === "inspect_classroom")?.execute({
        include: ["lesson", "workspace", "anchors", "scene", "assistant"],
        anchorQuery: {
          resolverId: "locator.html.element",
          input: { filePath: "lesson.html", id: "lesson" },
        },
      });
    });

    expect(inspected).toEqual(
      expect.objectContaining({
        ok: true,
        status: "completed",
        data: expect.objectContaining({
          lesson: expect.objectContaining({ id: "lesson.browser-fixture" }),
          workspace: expect.objectContaining({
            files: expect.arrayContaining([
              expect.objectContaining({ path: "lesson.html" }),
            ]),
          }),
          anchors: [
            expect.objectContaining({
              locatorId: "locator.html.element",
              queryIntent: "html.element",
            }),
          ],
          scene: expect.objectContaining({ activeTarget: null }),
          assistant: expect.objectContaining({ status: "working" }),
        }),
      }),
    );
    expect(JSON.stringify(inspected)).not.toMatch(/geometry|selector|domnode/iu);

    const reset = await page.evaluate(async () => {
      const tools = (
        window as unknown as {
          __lessoniqueRegisteredTools: Array<{
            name: string;
            execute: (input: unknown) => Promise<unknown>;
          }>;
        }
      ).__lessoniqueRegisteredTools;
      return tools.find(({ name }) => name === "reset_classroom")?.execute({
        scope: "all",
      });
    });

    expect(reset).toEqual(
      expect.objectContaining({
        ok: true,
        status: "completed",
        data: expect.objectContaining({
          scope: "all",
          lessonStatus: "idle",
          workspaceStatus: "idle",
          resourcesRemaining: 0,
        }),
      }),
    );
    await expect(getWorkspaceTab(page, "lesson.html")).toHaveCount(0);
  });

  test("loads semantic landmarks without horizontal overflow", async ({ page }) => {
    await expect(page).toHaveTitle(/Lessonique/);
    await expect(
      page.getByRole("complementary", { name: "Primary navigation" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("main", { name: "Lessonique Classroom" }),
    ).toBeVisible();
    await expect(
      page.getByRole("complementary", { name: "Project Files" }),
    ).toBeVisible();
    await expect(
      page.getByRole("complementary", { name: "Learning agent" }),
    ).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );

    expect(hasHorizontalOverflow).toBe(false);
  });

  test("meets automated WCAG A and AA checks", async ({ page }) => {
    async function scanAccessibility() {
      return new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
    }

    const lightThemeScan = await scanAccessibility();

    expect(
      lightThemeScan.violations,
      JSON.stringify(lightThemeScan.violations, null, 2),
    ).toEqual([]);

    await page.getByRole("button", { name: "Toggle color theme" }).click();
    const darkThemeScan = await scanAccessibility();

    expect(
      darkThemeScan.violations,
      JSON.stringify(darkThemeScan.violations, null, 2),
    ).toEqual([]);
  });

  test("reveals the skip link only for keyboard navigation", async ({ page }) => {
    const skipLink = page.getByRole("link", {
      name: "Skip to Classroom Workspace",
    });
    const workspace = page.locator("#classroom-workspace");

    await expect(skipLink).toHaveCSS("opacity", "0");
    const hiddenBox = await skipLink.boundingBox();
    expect(hiddenBox).not.toBeNull();
    expect(hiddenBox!.width).toBeLessThanOrEqual(1);
    expect(hiddenBox!.height).toBeLessThanOrEqual(1);
    await skipLink.focus();
    await expect(skipLink).toBeVisible();
    await expect(skipLink).toHaveCSS("opacity", "1");
    await expect(skipLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(workspace).toBeFocused();
  });

  test("supports keyboard panel controls on desktop", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium");

    const agent = page.getByRole("complementary", { name: "Learning agent" });

    const resizeHandle = page.getByRole("separator", {
      name: "Resize learning agent panel",
    });
    await expect(resizeHandle).toHaveCSS("cursor", "col-resize");
    await resizeHandle.press("ArrowLeft");
    await expect(resizeHandle).toHaveAttribute("aria-valuenow", "416");
    await page.getByRole("button", { name: "Collapse learning agent" }).click();
    await expect(agent).toHaveCSS("width", "76px");
  });

  test("persists the selected theme across reloads", async ({ page }) => {
    const initialTheme = await page.locator("html").getAttribute("class");

    await page.getByRole("button", { name: "Toggle color theme" }).click();
    await page.reload();

    const persistedTheme = await page.locator("html").getAttribute("class");
    expect(persistedTheme).not.toBe(initialTheme);
  });

  test("keeps Monaco height stable and applies the Deep Ocean dark theme", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium");

    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });
    await page.reload();

    const editor = page.getByRole("textbox", { name: "Workspace code editor" });
    const editorPanel = page.locator("#workspace-editor-panel");
    await expect(editor).toBeVisible({ timeout: 15_000 });

    const initialHeight = await editorPanel.evaluate(
      (element) => element.getBoundingClientRect().height,
    );
    await page.waitForTimeout(1_500);
    const settledHeight = await editorPanel.evaluate(
      (element) => element.getBoundingClientRect().height,
    );

    expect(Math.abs(settledHeight - initialHeight)).toBeLessThanOrEqual(1);
    expect(settledHeight).toBeLessThan(720);

    await page.getByRole("button", { name: "Toggle color theme" }).click();
    await expect(editorPanel).toHaveAttribute(
      "data-editor-theme",
      "lessonique-deep-ocean",
    );
    await expect(page.locator(".monaco-editor")).toHaveCSS(
      "background-color",
      "rgb(6, 24, 38)",
    );
    expect(
      consoleErrors.filter((message) =>
        message.includes("Maximum update depth exceeded"),
      ),
    ).toEqual([]);
  });

  test("uses the bundled Fantasque Sans Mono font with programming ligatures", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium");

    const editor = page.getByRole("textbox", { name: "Workspace code editor" });
    await expect(editor).toBeVisible({ timeout: 15_000 });

    await page.evaluate(async () => {
      await document.fonts.load('14px "Fantasque Sans Mono"');
    });

    const typography = await page
      .locator(".monaco-editor .view-lines")
      .evaluate((element) => {
        const styles = window.getComputedStyle(element);
        return {
          fontFamily: styles.fontFamily,
          fontFeatureSettings: styles.fontFeatureSettings,
          fontLoaded: document.fonts.check('14px "Fantasque Sans Mono"'),
          localFontRequested: performance
            .getEntriesByType("resource")
            .some(
              (entry) =>
                new URL(entry.name).pathname ===
                "/fonts/fantasque-sans-mono/FantasqueSansMono-Regular.woff2",
            ),
        };
    });

    expect(typography.fontFamily).toContain("Fantasque Sans Mono");
    expect(typography.fontFeatureSettings).toContain('"liga"');
    expect(typography.fontFeatureSettings).toContain('"calt"');
    expect(typography.fontFeatureSettings).not.toContain("off");
    expect(typography.fontLoaded).toBe(true);
    expect(typography.localFontRequested).toBe(true);

    const licenseResponse = await page.request.get(
      "/fonts/fantasque-sans-mono/LICENSE.txt",
    );
    expect(licenseResponse.ok()).toBe(true);
    await expect(licenseResponse.text()).resolves.toContain(
      "SIL OPEN FONT LICENSE Version 1.1",
    );
  });

  test("toggles automatic execution and keeps only the latest console result", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium");

    const editor = page.getByRole("textbox", { name: "Workspace code editor" });
    const editorPanel = page.locator("#workspace-editor-panel");
    const classroom = page.getByRole("main", { name: "Lessonique Classroom" });
    const consoleEntries = page
      .getByRole("log", { name: "Runtime console" })
      .locator("[data-console-entry-id]");
    const runtimeConsole = page.getByRole("log", { name: "Runtime console" });
    await expect(editor).toBeVisible({ timeout: 15_000 });
    const stopAutomaticExecution = page.getByRole("button", {
      name: "Stop workspace",
    });
    await expect(stopAutomaticExecution).toBeVisible();
    await expect(stopAutomaticExecution).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("button", { name: "Run", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Run workspace" }),
    ).toHaveCount(0);

    const initialEditorHeight = await editorPanel.evaluate(
      (element) => element.getBoundingClientRect().height,
    );
    const initialClassroomHeight = await classroom.evaluate(
      (element) => element.getBoundingClientRect().height,
    );

    await page.getByRole("button", { name: "Clear console" }).click();
    await getWorkspaceTab(page, "script.js").click();
    await editor.press("Control+A");
    await page.keyboard.insertText("console.log('stale');");
    await editor.press("Control+A");
    await page.keyboard.insertText("console.log('latest');");

    await expect(consoleEntries).toHaveCount(1, { timeout: 20_000 });
    await expect(consoleEntries.first()).toContainText("latest");
    await expect(runtimeConsole).not.toContainText("stale");
    await page.waitForTimeout(1_000);

    await expect(consoleEntries).toHaveCount(1);
    await stopAutomaticExecution.click();
    const runAutomaticExecution = page.getByRole("button", {
      name: "Run workspace",
    });
    await expect(runAutomaticExecution).toBeVisible();
    await expect(runAutomaticExecution).toHaveAttribute("aria-pressed", "false");
    await expect(stopAutomaticExecution).toHaveCount(0);

    await editor.press("Control+A");
    await page.keyboard.insertText("console.log('paused change');");
    await page.waitForTimeout(750);
    await expect(consoleEntries).toHaveCount(1);
    await expect(consoleEntries.first()).toContainText("latest");
    await expect(runtimeConsole).not.toContainText("paused change");

    await runAutomaticExecution.click();
    await expect(stopAutomaticExecution).toBeVisible();
    await expect(stopAutomaticExecution).toHaveAttribute("aria-pressed", "true");
    await expect(runAutomaticExecution).toHaveCount(0);
    await expect(consoleEntries).toHaveCount(1, { timeout: 20_000 });
    await expect(consoleEntries.first()).toContainText("paused change");
    await expect(runtimeConsole).not.toContainText("latest");

    await editor.press("Control+A");
    await page.keyboard.insertText("throw new Error('latest runtime failure');");
    await expect(runtimeConsole).toContainText("latest runtime failure", {
      timeout: 20_000,
    });
    await expect(runtimeConsole).not.toContainText("paused change");

    await page.getByRole("button", { name: "Clear console" }).click();
    await expect(consoleEntries).toHaveCount(0);
    await expect(stopAutomaticExecution).toBeVisible();
    expect(
      await editorPanel.evaluate(
        (element) => element.getBoundingClientRect().height,
      ),
    ).toBe(initialEditorHeight);
    expect(
      await classroom.evaluate(
        (element) => element.getBoundingClientRect().height,
      ),
    ).toBe(initialClassroomHeight);
  });

  test("reruns identical lesson source after reset and honors read-only files", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium");

    const lessonInput = {
      lessonId: "lesson.same-source-runtime",
      lessonMode: "explain",
      title: "Same-source runtime verification",
      objective: "Verify reset execution and workspace file permissions.",
      replaceExisting: true,
      environment: {
        profileId: "profile.javascript-console",
        languageIds: ["language.javascript"],
        activeFile: "variables.js",
        activeSurfaceId: "editor",
      },
      files: [
        {
          path: "variables.js",
          languageId: "language.javascript",
          content: "console.log('same-source-run');",
        },
      ],
      steps: [
        {
          id: "step.same-source-runtime",
          title: "Inspect the current run",
          objective: "Confirm that the current source executes exactly once.",
        },
      ],
    };
    const runtimeConsole = page.getByRole("log", { name: "Runtime console" });
    const consoleEntries = runtimeConsole.locator("[data-console-entry-id]");
    await expect(
      page.getByRole("textbox", { name: "Workspace code editor" }),
    ).toBeVisible({ timeout: 15_000 });

    for (let replacement = 0; replacement < 2; replacement += 1) {
      const result = await invokeRegisteredTool(
        page,
        "create_guided_lesson",
        lessonInput,
      );
      expect(result).toEqual(expect.objectContaining({ ok: true }));
      await expect(consoleEntries).toHaveCount(1, { timeout: 20_000 });
      await expect(consoleEntries.first()).toContainText("same-source-run");
    }

    const readOnlyResult = await invokeRegisteredTool(
      page,
      "create_guided_lesson",
      {
        ...lessonInput,
        files: lessonInput.files.map((file) => ({ ...file, readOnly: true })),
      },
    );
    expect(readOnlyResult).toEqual(expect.objectContaining({ ok: true }));
    await expect(consoleEntries).toHaveCount(1, { timeout: 20_000 });

    const editor = page.getByRole("textbox", { name: "Workspace code editor" });
    await editor.press("Control+A");
    await page.keyboard.insertText("console.log('forbidden-visible-edit');");
    await expect(page.locator(".monaco-editor .view-lines")).toContainText(
      "same-source-run",
    );
    await expect(page.locator(".monaco-editor .view-lines")).not.toContainText(
      "forbidden-visible-edit",
    );
    await expect(runtimeConsole).not.toContainText("forbidden-visible-edit");
  });

  test("resizes editor and console precisely while the empty console fills its track", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium");
    await page.setViewportSize({ width: 1440, height: 900 });
    const profile = page.getByRole("combobox", { name: "Environment profile" });
    await profile.selectOption("profile.javascript-console");
    await page.getByRole("button", { name: "Clear console" }).click();

    const resizer = page.getByRole("separator", {
      name: "Resize editor and console panels",
    });
    const editorRegion = page.locator(
      '[data-interaction-anchor="anchor.workspace-editor"]',
    );
    const lowerPanel = page.locator('[data-slot="workspace-lower-panel"]');
    const consolePanel = page.locator(
      '[data-interaction-anchor="anchor.workspace-console"]',
    );
    const runtimeConsole = page.getByRole("log", { name: "Runtime console" });
    const emptyState = page.locator('[data-slot="console-empty-state"]');
    await expect(emptyState).toBeVisible();
    await expect(resizer).toHaveCSS("cursor", "row-resize");

    const initial = await measureVerticalSplit(
      editorRegion,
      lowerPanel,
      consolePanel,
      runtimeConsole,
    );
    expect(Math.abs(initial.lowerHeight - initial.consolePanelHeight)).toBeLessThanOrEqual(1);
    expect(Math.abs(initial.lowerBottom - initial.consoleBottom)).toBeLessThanOrEqual(1);
    expect(initial.editorHeight).toBeGreaterThanOrEqual(144);
    expect(initial.lowerHeight).toBeGreaterThanOrEqual(104);

    const resizerBox = await resizer.boundingBox();
    if (!resizerBox) throw new Error("The editor-console resizer is not measurable.");
    const centerX = resizerBox.x + resizerBox.width / 2;
    const centerY = resizerBox.y + resizerBox.height / 2;
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.mouse.move(centerX, centerY - 90, { steps: 8 });
    await expect(page.locator('[data-slot="workspace-content"]')).toHaveAttribute(
      "data-vertical-split-resizing",
      "true",
    );
    await page.mouse.up();

    const enlarged = await measureVerticalSplit(
      editorRegion,
      lowerPanel,
      consolePanel,
      runtimeConsole,
    );
    expect(enlarged.lowerHeight).toBeGreaterThan(initial.lowerHeight + 50);
    expect(enlarged.editorHeight).toBeLessThan(initial.editorHeight - 50);
    expect(Math.abs(enlarged.lowerHeight - enlarged.consolePanelHeight)).toBeLessThanOrEqual(1);
    expect(Math.abs(enlarged.lowerBottom - enlarged.consoleBottom)).toBeLessThanOrEqual(1);

    await resizer.press("Home");
    const minimumConsole = await measureVerticalSplit(
      editorRegion,
      lowerPanel,
      consolePanel,
      runtimeConsole,
    );
    expect(minimumConsole.lowerHeight).toBeGreaterThanOrEqual(104);
    expect(minimumConsole.editorHeight).toBeGreaterThanOrEqual(144);

    await resizer.press("ArrowUp");
    await expect
      .poll(
        async () =>
          (
            await measureVerticalSplit(
              editorRegion,
              lowerPanel,
              consolePanel,
              runtimeConsole,
            )
          ).lowerHeight,
      )
      .toBeGreaterThan(minimumConsole.lowerHeight);
    const keyboardAdjusted = await measureVerticalSplit(
      editorRegion,
      lowerPanel,
      consolePanel,
      runtimeConsole,
    );
    expect(keyboardAdjusted.lowerHeight).toBeGreaterThan(minimumConsole.lowerHeight);
    expect(keyboardAdjusted.editorHeight).toBeGreaterThanOrEqual(144);
    expect(Math.abs(keyboardAdjusted.lowerHeight - keyboardAdjusted.consolePanelHeight)).toBeLessThanOrEqual(1);
    expect(Math.abs(keyboardAdjusted.lowerBottom - keyboardAdjusted.consoleBottom)).toBeLessThanOrEqual(1);
  });

  test("keeps high-volume console output inside its scrollable region", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium");

    const editor = page.getByRole("textbox", { name: "Workspace code editor" });
    const editorPanel = page.locator("#workspace-editor-panel");
    const classroom = page.getByRole("main", { name: "Lessonique Classroom" });
    const runtimeConsole = page.getByRole("log", { name: "Runtime console" });
    const consoleEntries = runtimeConsole.locator("[data-console-entry-id]");
    await expect(editor).toBeVisible({ timeout: 15_000 });

    const initialEditorHeight = await editorPanel.evaluate(
      (element) => element.getBoundingClientRect().height,
    );
    const initialClassroomHeight = await classroom.evaluate(
      (element) => element.getBoundingClientRect().height,
    );

    await page.getByRole("button", { name: "Clear console" }).click();
    await getWorkspaceTab(page, "script.js").click();
    await editor.press("Control+A");
    await page.keyboard.insertText(
      "for (let index = 0; index < 120; index += 1) console.log(index);",
    );

    await expect(consoleEntries).toHaveCount(100, { timeout: 20_000 });
    const consoleDimensions = await runtimeConsole.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));

    expect(consoleDimensions.scrollHeight).toBeGreaterThan(
      consoleDimensions.clientHeight,
    );
    expect(
      await editorPanel.evaluate(
        (element) => element.getBoundingClientRect().height,
      ),
    ).toBe(initialEditorHeight);
    expect(
      await classroom.evaluate(
        (element) => element.getBoundingClientRect().height,
      ),
    ).toBe(initialClassroomHeight);
  });

  test("switches provider profiles without reloading the classroom", async ({
    page,
  }) => {
    const profile = page.getByRole("combobox", { name: "Environment profile" });
    await expect(profile).toBeEnabled();
    await expect(getWorkspaceTab(page, "index.html")).toBeVisible();
    await expect(page.getByText("Live Preview", { exact: true })).toBeVisible();

    const startedAt = Date.now();
    await profile.selectOption("profile.javascript-console");
    await expect(getWorkspaceTab(page, "script.js")).toBeVisible();
    expect(Date.now() - startedAt).toBeLessThan(1_000);
    await expect(getWorkspaceTab(page, "index.html")).toHaveCount(0);
    await expect(page.getByText("Live Preview", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("log", { name: "Runtime console" })).toBeVisible();

    await profile.selectOption("profile.vanilla-web");
    await expect(getWorkspaceTab(page, "index.html")).toBeVisible();
    await expect(page.getByText("Live Preview", { exact: true })).toBeVisible();
  });

  test("applies preview viewport configuration through the surface adapter", async ({
    page,
  }) => {
    const profile = page.getByRole("combobox", { name: "Environment profile" });
    await expect(profile).toBeEnabled();
    const preview = page.locator("[data-preview-viewport]:visible");
    await expect(preview).toHaveAttribute("data-preview-viewport", "desktop");

    await page.getByRole("button", { name: "Mobile preview" }).click();

    await expect(preview).toHaveAttribute("data-preview-viewport", "mobile");
    await expect(page.getByRole("button", { name: "Mobile preview" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("restores the active workspace profile from local persistence", async ({
    page,
  }) => {
    const profile = page.getByRole("combobox", { name: "Environment profile" });
    await expect(profile).toBeEnabled();
    await profile.selectOption("profile.javascript-console");
    await expect(getWorkspaceTab(page, "script.js")).toBeVisible();

    await page.reload();

    await expect(profile).toHaveValue("profile.javascript-console");
    await expect(getWorkspaceTab(page, "script.js")).toBeVisible();
    await expect(getWorkspaceTab(page, "index.html")).toHaveCount(0);
  });

  test("updates the preview and console from independent HTML, CSS, and JavaScript models", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium");
    const profile = page.getByRole("combobox", { name: "Environment profile" });
    await expect(profile).toBeEnabled();
    const editor = page.getByRole("textbox", { name: "Workspace code editor" });
    await expect(editor).toBeVisible({ timeout: 15_000 });

    async function replaceActiveFile(content: string) {
      await editor.press("Control+A");
      await page.keyboard.insertText(content);
      await page.waitForTimeout(350);
    }

    await getWorkspaceTab(page, "index.html").click();
    await replaceActiveFile(
      '<!doctype html><html lang="en"><head><link rel="stylesheet" href="./styles.css"></head><body><button id="lessonique-demo">Waiting</button><script src="./script.js"></script></body></html>',
    );
    await getWorkspaceTab(page, "styles.css").click();
    await replaceActiveFile(
      "#lessonique-demo { color: rgb(255, 0, 0); font-weight: 700; }",
    );
    await getWorkspaceTab(page, "script.js").click();
    await replaceActiveFile("const result = ;");
    await expect(page.locator(".monaco-editor .squiggly-error")).toBeVisible({
      timeout: 5_000,
    });
    await replaceActiveFile(
      'document.querySelector("#lessonique-demo").textContent = "Preview updated"; console.log("workspace-ready");',
    );
    await expect(page.locator(".monaco-editor .squiggly-error")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Stop workspace" }),
    ).toBeVisible();

    const preview = page.frameLocator("[data-preview-viewport]:visible iframe");
    const button = preview.getByRole("button", { name: "Preview updated" });
    await expect(button).toBeVisible({ timeout: 20_000 });
    await expect(button).toHaveCSS("color", "rgb(255, 0, 0)");
    await expect(page.getByRole("log", { name: "Runtime console" })).toContainText(
      "workspace-ready",
      { timeout: 20_000 },
    );
  });
});

function getWorkspaceTab(page: Page, path: string) {
  return page.locator(`[data-workspace-tab-path=${JSON.stringify(path)}]`);
}

function getWorkspaceTabItem(page: Page, path: string) {
  return page.locator(
    `[data-workspace-tab-item-path=${JSON.stringify(path)}]`,
  );
}

async function invokeRegisteredTool(
  page: Page,
  name: string,
  input: unknown,
) {
  return page.evaluate(async ({ requestedName, requestedInput }) => {
    const tools = (
      window as unknown as {
        __lessoniqueRegisteredTools: Array<{
          name: string;
          execute: (toolInput: unknown) => Promise<unknown>;
        }>;
      }
    ).__lessoniqueRegisteredTools;
    return tools.find(({ name: toolName }) => toolName === requestedName)?.execute(
      requestedInput,
    );
  }, { requestedName: name, requestedInput: input });
}

async function initializeClassroomThroughWebMCP(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __lessoniqueRegisteredTools: Array<{ name: string }>;
            }
          ).__lessoniqueRegisteredTools.length,
      ),
    )
    .toBe(13);

  const result = await invokeRegisteredTool(page, "create_guided_lesson", {
    lessonId: "lesson.e2e-shell",
    lessonMode: "mixed",
    title: "Classroom verification lesson",
    objective: "Verify the complete Lessonique classroom experience.",
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
        content:
          '<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>Lessonique Workspace</title>\n    <link rel="stylesheet" href="./styles.css" />\n  </head>\n  <body>\n    <main id="app"></main>\n    <script src="./script.js"></script>\n  </body>\n</html>\n',
      },
      {
        path: "styles.css",
        languageId: "language.css",
        content: "",
      },
      {
        path: "script.js",
        languageId: "language.javascript",
        content: "",
      },
    ],
    steps: [
      {
        id: "step.e2e-shell",
        title: "Verify the classroom",
        objective: "Exercise the real workspace and learning controls.",
      },
    ],
  });

  expect(result).toEqual(expect.objectContaining({ ok: true }));
  await expect(
    page.getByRole("main", { name: "Lessonique Classroom" }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(
    page.locator('[data-slot="classroom-transition"]'),
  ).toHaveCSS("opacity", "1");
  await expect(
    page.locator('[data-slot="classroom-transition"]'),
  ).toHaveCSS("transform", "none");
  await expect(page).toHaveURL(/\/$/u);
}

async function getWorkspaceTabOrder(page: Page): Promise<string[]> {
  return page.locator("[data-workspace-tab-path]").evaluateAll((tabs) =>
    tabs.map((tab) => tab.getAttribute("data-workspace-tab-path") ?? ""),
  );
}

async function measureWorkspaceReflow(page: Page) {
  return page.evaluate(() => {
    const body = document.querySelector<HTMLElement>('[data-slot="workspace-body"]');
    const content = document.querySelector<HTMLElement>('[data-slot="workspace-content"]');
    if (!body || !content) {
      throw new Error("Workspace reflow elements are unavailable.");
    }
    const bodyBounds = body.getBoundingClientRect();
    const contentBounds = content.getBoundingClientRect();
    return {
      bodyLeft: bodyBounds.left,
      bodyRight: bodyBounds.right,
      contentLeft: contentBounds.left,
      contentRight: contentBounds.right,
      contentWidth: contentBounds.width,
    };
  });
}

async function measureVerticalSplit(
  editorRegion: Locator,
  lowerPanel: Locator,
  consolePanel: Locator,
  runtimeConsole: Locator,
) {
  const [editorBounds, lowerBounds, consolePanelBounds, consoleBounds] = await Promise.all([
    editorRegion.boundingBox(),
    lowerPanel.boundingBox(),
    consolePanel.boundingBox(),
    runtimeConsole.boundingBox(),
  ]);
  if (!editorBounds || !lowerBounds || !consolePanelBounds || !consoleBounds) {
    throw new Error("The editor-console split is not measurable.");
  }
  return {
    editorHeight: editorBounds.height,
    lowerHeight: lowerBounds.height,
    lowerBottom: lowerBounds.y + lowerBounds.height,
    consolePanelHeight: consolePanelBounds.height,
    consoleHeight: consoleBounds.height,
    consoleBottom: consoleBounds.y + consoleBounds.height,
  };
}

async function guidanceTargetOverlap(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const target = document.querySelector<HTMLElement>(
      '[data-interaction-anchor="anchor.learning-plan"]',
    );
    const guide = document.querySelector<HTMLElement>('[data-slot="visual-guide"]');
    const companion = document.querySelector<HTMLElement>(
      '[data-slot="assistant-overlay-host"] [data-assistant-state]',
    );
    if (!target || !guide) {
      return { area: Number.POSITIVE_INFINITY, guidance: null, target: null };
    }
    const targetRect = target.getBoundingClientRect();
    const guidanceRect = guide.getBoundingClientRect();
    const overlapArea = (candidate: DOMRect) => {
      const overlapWidth = Math.max(
        0,
        Math.min(targetRect.right, candidate.right) -
          Math.max(targetRect.left, candidate.left),
      );
      const overlapHeight = Math.max(
        0,
        Math.min(targetRect.bottom, candidate.bottom) -
          Math.max(targetRect.top, candidate.top),
      );
      return overlapWidth * overlapHeight;
    };
    return {
      area:
        overlapArea(guidanceRect) +
        (companion ? overlapArea(companion.getBoundingClientRect()) : 0),
      guidance: {
        left: guidanceRect.left,
        top: guidanceRect.top,
        right: guidanceRect.right,
        bottom: guidanceRect.bottom,
      },
      target: {
        left: targetRect.left,
        top: targetRect.top,
        right: targetRect.right,
        bottom: targetRect.bottom,
      },
    };
  });
}

async function codeGuidanceIsSafe(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const target = document.querySelector<HTMLElement>(
      '[data-guidance-effect="highlight"]',
    );
    const guide = document.querySelector<HTMLElement>('[data-slot="visual-guide"]');
    const companion = document.querySelector<HTMLElement>(
      '[data-slot="draggable-companion"]',
    );
    if (!target || !guide || !companion) return false;
    const targetRect = target.getBoundingClientRect();
    const guideRect = guide.getBoundingClientRect();
    const companionRect = companion.getBoundingClientRect();
    const insideViewport = (rect: DOMRect) =>
      rect.left >= 0 &&
      rect.top >= 0 &&
      rect.right <= window.innerWidth &&
      rect.bottom <= window.innerHeight;
    const overlapArea = (candidate: DOMRect) =>
      Math.max(
        0,
        Math.min(targetRect.right, candidate.right) -
          Math.max(targetRect.left, candidate.left),
      ) *
      Math.max(
        0,
        Math.min(targetRect.bottom, candidate.bottom) -
          Math.max(targetRect.top, candidate.top),
      );
    return (
      insideViewport(guideRect) &&
      insideViewport(companionRect) &&
      overlapArea(guideRect) === 0 &&
      overlapArea(companionRect) === 0
    );
  });
}

async function codeConnectorIsSafe(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const highlight = document.querySelector<HTMLElement>(
      '[data-guidance-effect="highlight"]',
    );
    const guide = document.querySelector<HTMLElement>('[data-slot="visual-guide"]');
    const connector = document.querySelector<SVGSVGElement>(
      '[data-guidance-presentation="guide-connector"]',
    );
    const line = connector?.querySelector<SVGPathElement>(
      '[data-guidance-connector-line="true"]',
    );
    const endpoint = connector?.querySelector<SVGCircleElement>(
      '[data-guidance-connector-endpoint="target"]',
    );
    if (!highlight || !guide || !connector || !line || !endpoint) return false;

    const parsePoint = (value: string | null) => {
      const [x, y] = value?.split(",").map(Number) ?? [];
      return Number.isFinite(x) && Number.isFinite(y) ? { x: x!, y: y! } : null;
    };
    const targetPoint = parsePoint(connector.getAttribute("data-connector-target"));
    const guidePoint = parsePoint(connector.getAttribute("data-connector-guide"));
    const linePoints = (line.getAttribute("data-guidance-connector-points") ?? "")
      .trim()
      .split(/\s+/u)
      .filter(Boolean)
      .map((value) => parsePoint(value))
      .filter((point): point is { x: number; y: number } => Boolean(point));
    if (!targetPoint || !guidePoint || linePoints.length < 2) return false;

    const highlightRect = highlight.getBoundingClientRect();
    const guideRect = guide.getBoundingClientRect();
    const endpointRect = endpoint.getBoundingClientRect();
    const close = (left: number, right: number) => Math.abs(left - right) <= 1.5;
    const samePoint = (
      left: { x: number; y: number },
      right: { x: number; y: number },
    ) => close(left.x, right.x) && close(left.y, right.y);
    const outsideHighlight =
      targetPoint.x < highlightRect.left ||
      targetPoint.x > highlightRect.right ||
      targetPoint.y < highlightRect.top ||
      targetPoint.y > highlightRect.bottom;
    const targetDistance = Math.hypot(
      targetPoint.x < highlightRect.left
        ? highlightRect.left - targetPoint.x
        : targetPoint.x > highlightRect.right
          ? targetPoint.x - highlightRect.right
          : 0,
      targetPoint.y < highlightRect.top
        ? highlightRect.top - targetPoint.y
        : targetPoint.y > highlightRect.bottom
          ? targetPoint.y - highlightRect.bottom
          : 0,
    );
    const endpointOverlap =
      Math.max(
        0,
        Math.min(highlightRect.right, endpointRect.right) -
          Math.max(highlightRect.left, endpointRect.left),
      ) *
      Math.max(
        0,
        Math.min(highlightRect.bottom, endpointRect.bottom) -
          Math.max(highlightRect.top, endpointRect.top),
      );
    const guideBoundaryDistance = Math.min(
      Math.abs(guidePoint.x - guideRect.left),
      Math.abs(guidePoint.x - guideRect.right),
      Math.abs(guidePoint.y - guideRect.top),
      Math.abs(guidePoint.y - guideRect.bottom),
    );
    const guidePointWithinBounds =
      guidePoint.x >= guideRect.left - 1.5 &&
      guidePoint.x <= guideRect.right + 1.5 &&
      guidePoint.y >= guideRect.top - 1.5 &&
      guidePoint.y <= guideRect.bottom + 1.5;
    const orthogonal = linePoints.slice(1).every((point, index) => {
      const previous = linePoints[index]!;
      return close(point.x, previous.x) || close(point.y, previous.y);
    });
    const crossesHighlight = linePoints.slice(1).some((point, index) => {
      const previous = linePoints[index]!;
      if (close(point.x, previous.x)) {
        return (
          point.x > highlightRect.left + 0.5 &&
          point.x < highlightRect.right - 0.5 &&
          Math.max(Math.min(point.y, previous.y), highlightRect.top + 0.5) <
            Math.min(Math.max(point.y, previous.y), highlightRect.bottom - 0.5)
        );
      }
      if (close(point.y, previous.y)) {
        return (
          point.y > highlightRect.top + 0.5 &&
          point.y < highlightRect.bottom - 0.5 &&
          Math.max(Math.min(point.x, previous.x), highlightRect.left + 0.5) <
            Math.min(Math.max(point.x, previous.x), highlightRect.right - 0.5)
        );
      }
      return true;
    });
    const highlightStyle = getComputedStyle(highlight);
    const shadowColors = [
      ...highlightStyle.boxShadow.matchAll(/rgba?\(([^)]+)\)/gu),
    ];
    const hasVisibleBoxShadow =
      highlightStyle.boxShadow !== "none" &&
      (shadowColors.length === 0 ||
        shadowColors.some(([, channels]) => {
          const values = channels!
            .split(/[,/\s]+/u)
            .filter(Boolean)
            .map(Number);
          return values.length < 4 || values.at(-1)! > 0;
        }));
    const highlightAppearance = highlight.getAttribute(
      "data-guidance-highlight-appearance",
    );
    const highlightPresentationIsValid =
      highlightAppearance === "spotlight"
        ? parseFloat(highlightStyle.borderTopWidth) === 0 &&
          highlightStyle.backgroundColor === "rgba(0, 0, 0, 0)" &&
          !hasVisibleBoxShadow
        : highlightAppearance === "standalone" &&
          parseFloat(highlightStyle.borderTopWidth) >= 2 &&
          highlightStyle.backgroundColor !== "rgba(0, 0, 0, 0)" &&
          hasVisibleBoxShadow;

    return (
      samePoint(linePoints[0]!, targetPoint) &&
      samePoint(linePoints.at(-1)!, guidePoint) &&
      outsideHighlight &&
      targetDistance >= 1 &&
      targetDistance <= 12 &&
      endpointOverlap === 0 &&
      guideBoundaryDistance <= 1.5 &&
      guidePointWithinBounds &&
      orthogonal &&
      !crossesHighlight &&
      highlightPresentationIsValid
    );
  });
}

async function companionIsBesideGuideOuterEdge(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const target = document.querySelector<HTMLElement>(
      '[data-guidance-effect="highlight"]',
    );
    const guide = document.querySelector<HTMLElement>('[data-slot="visual-guide"]');
    const companion = document.querySelector<HTMLElement>(
      '[data-slot="draggable-companion"]',
    );
    if (!target || !guide || !companion) return false;

    const targetRect = target.getBoundingClientRect();
    const guideRect = guide.getBoundingClientRect();
    const companionRect = companion.getBoundingClientRect();
    const targetCenter = {
      x: targetRect.left + targetRect.width / 2,
      y: targetRect.top + targetRect.height / 2,
    };
    const guideCenter = {
      x: guideRect.left + guideRect.width / 2,
      y: guideRect.top + guideRect.height / 2,
    };
    const horizontal = Math.abs(guideCenter.x - targetCenter.x) >=
      Math.abs(guideCenter.y - targetCenter.y);

    if (horizontal) {
      const gap = guideCenter.x >= targetCenter.x
        ? companionRect.left - guideRect.right
        : guideRect.left - companionRect.right;
      return gap >= 10 && gap <= 14;
    }

    const gap = guideCenter.y >= targetCenter.y
      ? companionRect.top - guideRect.bottom
      : guideRect.top - companionRect.bottom;
    return gap >= 10 && gap <= 14;
  });
}

type CodeGuidanceGeometry = Readonly<{
  highlight: readonly number[];
  guide: readonly number[];
  endpoint: readonly number[];
  line: readonly number[];
}>;

async function codeGuidanceGeometry(page: Page): Promise<CodeGuidanceGeometry> {
  return page.evaluate(() => {
    const highlight = document.querySelector<HTMLElement>(
      '[data-guidance-effect="highlight"]',
    );
    const guide = document.querySelector<HTMLElement>('[data-slot="visual-guide"]');
    const connector = document.querySelector<SVGSVGElement>(
      '[data-guidance-presentation="guide-connector"]',
    );
    const line = connector?.querySelector<SVGPathElement>(
      '[data-guidance-connector-line="true"]',
    );
    const endpoint = connector?.querySelector<SVGCircleElement>(
      '[data-guidance-connector-endpoint="target"]',
    );
    if (!highlight || !guide || !line || !endpoint) {
      throw new Error("Complete code guidance geometry is not visible.");
    }
    const highlightRect = highlight.getBoundingClientRect();
    const guideRect = guide.getBoundingClientRect();
    const endpointRect = endpoint.getBoundingClientRect();
    const linePoints = (line.getAttribute("data-guidance-connector-points") ?? "")
      .trim()
      .split(/[\s,]+/u)
      .filter(Boolean)
      .map(Number);
    return {
      highlight: [
        highlightRect.left,
        highlightRect.top,
        highlightRect.width,
        highlightRect.height,
      ],
      guide: [guideRect.left, guideRect.top, guideRect.width, guideRect.height],
      endpoint: [
        endpointRect.left,
        endpointRect.top,
        endpointRect.width,
        endpointRect.height,
      ],
      line: linePoints,
    };
  });
}

function expectCodeGuidanceGeometryClose(
  actual: CodeGuidanceGeometry,
  expected: CodeGuidanceGeometry,
): void {
  for (const key of ["highlight", "guide", "endpoint", "line"] as const) {
    expect(actual[key]).toHaveLength(expected[key].length);
    actual[key].forEach((value, index) => {
      expect(Math.abs(value - expected[key][index]!)).toBeLessThanOrEqual(2);
    });
  }
}

async function codeTargetNearEditorEdge(
  page: Page,
  edge: "top-left" | "bottom-right",
): Promise<boolean> {
  return page.evaluate((requestedEdge) => {
    const target = document.querySelector<HTMLElement>(
      '[data-guidance-effect="highlight"]',
    );
    const editor = document.querySelector<HTMLElement>(
      '[data-interaction-anchor="anchor.workspace-editor"]',
    );
    if (!target || !editor) return false;
    const targetRect = target.getBoundingClientRect();
    const editorRect = editor.getBoundingClientRect();
    return requestedEdge === "top-left"
      ? targetRect.top - editorRect.top < 60 &&
          targetRect.left - editorRect.left < 180
      : editorRect.bottom - targetRect.bottom < 60 &&
          editorRect.right - targetRect.right < 80;
  }, edge);
}

async function dragBy(
  page: Page,
  handle: Locator,
  deltaX: number,
  deltaY: number,
  draggedElement: Locator,
): Promise<void> {
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  const startX = box!.x + box!.width / 2;
  const startY = box!.y + box!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await expect(draggedElement).toHaveAttribute("data-dragging", "true");
  await expect(handle).toHaveCSS("cursor", "grabbing");
  await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 6 });
  await page.mouse.up();
  await expect(draggedElement).toHaveAttribute("data-dragging", "false");
}

async function guidanceFocusOverlap(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const target = document.querySelector<HTMLElement>(
      '[data-guidance-effect="focus"]',
    );
    const guide = document.querySelector<HTMLElement>('[data-slot="visual-guide"]');
    const companion = document.querySelector<HTMLElement>(
      '[data-slot="assistant-overlay-host"] [data-assistant-state]',
    );
    if (!target || !guide) return Number.POSITIVE_INFINITY;
    const targetRect = target.getBoundingClientRect();
    const overlapArea = (candidate: DOMRect) => {
      const width = Math.max(
        0,
        Math.min(targetRect.right, candidate.right) -
          Math.max(targetRect.left, candidate.left),
      );
      const height = Math.max(
        0,
        Math.min(targetRect.bottom, candidate.bottom) -
          Math.max(targetRect.top, candidate.top),
      );
      return width * height;
    };
    return (
      overlapArea(guide.getBoundingClientRect()) +
      (companion ? overlapArea(companion.getBoundingClientRect()) : 0)
    );
  });

}

async function previewMenuTargetAlignmentDelta(
  page: import("@playwright/test").Page,
) {
  const targetRect = await page
    .frameLocator("[data-preview-viewport]:visible iframe")
    .getByRole("button", { name: "Menu" })
    .boundingBox();
  const focusRect = await page
    .locator('[data-guidance-effect="focus"]')
    .boundingBox();
  if (!targetRect || !focusRect) return Number.POSITIVE_INFINITY;
  return Math.max(
    Math.abs(focusRect.x + 4 - targetRect.x),
    Math.abs(focusRect.y + 4 - targetRect.y),
    Math.abs(focusRect.width - 8 - targetRect.width),
    Math.abs(focusRect.height - 8 - targetRect.height),
  );
}

async function previewMenuGuidanceTargetOverlap(
  page: import("@playwright/test").Page,
) {
  const targetRect = await page
    .frameLocator("[data-preview-viewport]:visible iframe")
    .getByRole("button", { name: "Menu" })
    .boundingBox();
  const [guideRect, companionRect] = await Promise.all([
    page.locator('[data-slot="assistant-overlay-host"] [data-slot="visual-guide"]').boundingBox(),
    page.locator('[data-slot="assistant-overlay-host"] [data-assistant-state]').boundingBox(),
  ]);
  if (!targetRect || !guideRect) {
    return { area: Number.POSITIVE_INFINITY };
  }
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

async function invokeSceneControl(
  page: import("@playwright/test").Page,
  action: "pause" | "resume" | "next" | "previous" | "restart" | "cancel",
  sceneId = "scene.browser-companion",
) {
  return page.evaluate(async ({ requestedAction, requestedSceneId }) => {
    const tools = (
      window as unknown as {
        __lessoniqueRegisteredTools: Array<{
          name: string;
          execute: (input: unknown) => Promise<unknown>;
        }>;
      }
    ).__lessoniqueRegisteredTools;
    return tools.find(({ name }) => name === "control_teaching_scene")?.execute({
      action: requestedAction,
      sceneId: requestedSceneId,
    });
  }, { requestedAction: action, requestedSceneId: sceneId });
}
