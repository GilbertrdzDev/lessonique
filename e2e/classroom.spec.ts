import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

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
    await page.goto("/classroom");
  });

  test("registers the closed P0 WebMCP catalog from the top-level document", async ({
    page,
  }) => {
    const expectedNames = [
      "get_system_capabilities",
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
                inputSchema: { additionalProperties?: boolean };
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
            inputSchema: { additionalProperties?: boolean };
            execute: (input: unknown) => Promise<unknown>;
          }>;
        }
      ).__lessoniqueRegisteredTools;
      const capabilityTool = tools.find(({ name }) => name === "get_system_capabilities");
      return {
        allClosed: tools.every(
          ({ inputSchema }) => inputSchema.additionalProperties === false,
        ),
        result: await capabilityTool?.execute({ include: ["limits"] }),
      };
    });

    expect(discovery.allClosed).toBe(true);
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
    await expect(toolSelector.locator("option")).toHaveCount(12);
    await toolSelector.selectOption("play_teaching_scene");
    await expect(page.getByLabel("Tool input JSON")).toHaveValue(
      /target\.surface-anchor/u,
    );
    await expect(page.getByLabel("Tool input JSON")).toHaveValue(
      /assistant\.pointing/u,
    );

    await page.getByRole("button", { name: "Run all fixtures" }).click();
    const results = page.getByRole("list", { name: "Dev fixture results" });
    await expect(results.locator("li")).toHaveCount(12, { timeout: 30_000 });
    await expect(results.locator('[data-status="failed"]')).toHaveCount(0);
    await expect(
      results.locator(
        '[data-tool-name="control_teaching_scene"][data-status="cancelled"]',
      ),
    ).toHaveCount(1);
    await expect(
      page.getByRole("status").filter({ hasText: '"accepted": 12' }),
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

  test("runs the responsive menu setup, HTML wait, and tracked mobile CSS scene from the Dev Panel", async ({
    page,
  }, testInfo) => {
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
    await expect(guide).toContainText("Confirm the structure in context", {
      timeout: 15_000,
    });
    await expect(guide).toContainText("normalized interaction");
    const preview = page.frameLocator("[data-preview-viewport]:visible iframe");
    await preview.getByRole("button", { name: "Explore routes" }).click();
    await expect(page.getByLabel("Lessonique visual guidance")).toHaveCount(0, {
      timeout: 5_000,
    });

    await challengeFixtures.getByRole("button", {
      name: /Run CSS and mobile scene/u,
    }).click();
    await expect(invocationResult).toContainText('"stageId": "css"');
    await expect(invocationResult).toContainText('"accepted": true');
    await expect(guide).toContainText("Follow the control into the mobile preview", {
      timeout: 15_000,
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
    expect((await previewMenuGuidanceTargetOverlap(page)).area).toBe(0);

    await page.setViewportSize({ width: 1180, height: 820 });
    await expect
      .poll(() => previewMenuTargetAlignmentDelta(page))
      .toBeLessThanOrEqual(2);
    const guideBox = await guide.boundingBox();
    expect(guideBox).not.toBeNull();
    expect(guideBox!.x).toBeGreaterThanOrEqual(0);
    expect(guideBox!.y).toBeGreaterThanOrEqual(0);
    expect(guideBox!.x + guideBox!.width).toBeLessThanOrEqual(1180);
    expect(guideBox!.y + guideBox!.height).toBeLessThanOrEqual(820);
    expect((await previewMenuGuidanceTargetOverlap(page)).area).toBe(0);

    const resumed = await invokeSceneControl(
      page,
      "resume",
      "scene.responsive-menu-css",
    );
    expect(resumed).toEqual(expect.objectContaining({ ok: true }));
    await expect(page.getByLabel("Lessonique visual guidance")).toHaveCount(0, {
      timeout: 5_000,
    });
    await testInfo.attach("lessonique-responsive-menu-mobile-scene", {
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
                input: { text: "Inspect this registered learning target." },
              },
            ],
            guide: {
              title: "Responsive semantic guidance",
              body: "Keep this first line.\nKeep this second line.",
              supportingItems: ["First supporting item", "Second supporting item"],
            },
            caption: "Visual meaning remains complete without motion or audio.",
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
    await expect(companion).toHaveAttribute(
      "data-assistant-state",
      "assistant.thinking",
    );
    await expect(guide).toContainText("Responsive semantic guidance");
    await expect(guide).toContainText("Keep this first line.");
    await expect(guide).toContainText("Keep this second line.");
    await expect(guide).toContainText("Inspect this registered learning target.");
    await expect(guide).toContainText(
      "Visual meaning remains complete without motion or audio.",
    );
    const guideText = await guide.textContent();
    expect(guideText?.indexOf("First supporting item")).toBeLessThan(
      guideText?.indexOf("Second supporting item") ?? -1,
    );
    await expect(overlay).toHaveCSS("pointer-events", "none");
    for (const effect of ["focus", "spotlight", "highlight", "point"]) {
      await expect(
        page.locator(`[data-guidance-effect="${effect}"]`),
      ).toBeVisible();
    }

    await expect
      .poll(() => targetAlignmentDelta(page))
      .toBeLessThanOrEqual(2);
    await page.setViewportSize({ width: 1366, height: 900 });
    await expect(
      page.locator('[data-interaction-anchor="anchor.learning-plan"]'),
    ).toBeInViewport();
    await expect
      .poll(() => targetAlignmentDelta(page))
      .toBeLessThanOrEqual(2);
    const guideBox = await guide.boundingBox();
    expect(guideBox).not.toBeNull();
    expect(guideBox!.x).toBeGreaterThanOrEqual(0);
    expect(guideBox!.y).toBeGreaterThanOrEqual(0);
    expect(guideBox!.x + guideBox!.width).toBeLessThanOrEqual(1366);
    expect(guideBox!.y + guideBox!.height).toBeLessThanOrEqual(900);
    const overlap = await guidanceTargetOverlap(page);
    expect(overlap.area, JSON.stringify(overlap)).toBe(0);

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
    ).toBeVisible();
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

  test("supports keyboard panel controls on desktop", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium");

    const navigation = page.getByRole("complementary", {
      name: "Primary navigation",
    });
    const agent = page.getByRole("complementary", { name: "Learning agent" });

    await expect(navigation).toHaveCSS("width", "256px");
    await page.getByRole("button", { name: "Collapse navigation" }).click();
    await expect(navigation).toHaveCSS("width", "76px");

    const expandNavigation = page.getByRole("button", {
      name: "Expand navigation",
    });
    const brandIcon = expandNavigation.locator("[data-navigation-brand-icon]");
    const expandIcon = expandNavigation.locator(
      "[data-navigation-expand-icon]",
    );

    await expect(expandNavigation).toBeVisible();
    await expect(brandIcon).toHaveCSS("opacity", "1");
    await expect(expandIcon).toHaveCSS("opacity", "0");
    await expandNavigation.hover();
    await expect(brandIcon).toHaveCSS("opacity", "0");
    await expect(expandIcon).toHaveCSS("opacity", "1");
    await expandNavigation.click();
    await expect(navigation).toHaveCSS("width", "256px");

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

  test("runs one console log per edit without resizing the workspace", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium");

    const editor = page.getByRole("textbox", { name: "Workspace code editor" });
    const editorPanel = page.locator("#workspace-editor-panel");
    const classroom = page.getByRole("main", { name: "Lessonique Classroom" });
    const consoleEntries = page
      .getByRole("log", { name: "Runtime console" })
      .locator("[data-console-entry-id]");
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
    await page.keyboard.insertText("console.log('test');");

    await expect(consoleEntries).toHaveCount(1, { timeout: 20_000 });
    await expect(consoleEntries.first()).toContainText("test");
    await page.waitForTimeout(2_000);

    await expect(consoleEntries).toHaveCount(1);
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
    await page.getByRole("button", { name: "Run workspace" }).click();

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

async function targetAlignmentDelta(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const target = document.querySelector<HTMLElement>(
      '[data-interaction-anchor="anchor.learning-plan"]',
    );
    const focus = document.querySelector<HTMLElement>(
      '[data-guidance-effect="focus"]',
    );
    if (!target || !focus) return Number.POSITIVE_INFINITY;
    const targetRect = target.getBoundingClientRect();
    const focusRect = focus.getBoundingClientRect();
    return Math.max(
      Math.abs(focusRect.left + 4 - targetRect.left),
      Math.abs(focusRect.top + 4 - targetRect.top),
      Math.abs(focusRect.width - 8 - targetRect.width),
      Math.abs(focusRect.height - 8 - targetRect.height),
    );
  });
}

async function guidanceTargetOverlap(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const target = document.querySelector<HTMLElement>(
      '[data-interaction-anchor="anchor.learning-plan"]',
    );
    const guide = document.querySelector<HTMLElement>('[data-slot="visual-guide"]');
    const wrapper = guide?.parentElement;
    if (!target || !wrapper) {
      return { area: Number.POSITIVE_INFINITY, guidance: null, target: null };
    }
    const targetRect = target.getBoundingClientRect();
    const guidanceRect = wrapper.getBoundingClientRect();
    const overlapWidth = Math.max(
      0,
      Math.min(targetRect.right, guidanceRect.right) -
        Math.max(targetRect.left, guidanceRect.left),
    );
    const overlapHeight = Math.max(
      0,
      Math.min(targetRect.bottom, guidanceRect.bottom) -
        Math.max(targetRect.top, guidanceRect.top),
    );
    return {
      area: overlapWidth * overlapHeight,
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
  const guidanceRect = await page
    .locator('[data-slot="assistant-overlay-host"] [data-assistant-docked]')
    .boundingBox();
  if (!targetRect || !guidanceRect) {
    return { area: Number.POSITIVE_INFINITY };
  }
  const overlapWidth = Math.max(
    0,
    Math.min(targetRect.x + targetRect.width, guidanceRect.x + guidanceRect.width) -
      Math.max(targetRect.x, guidanceRect.x),
  );
  const overlapHeight = Math.max(
    0,
    Math.min(targetRect.y + targetRect.height, guidanceRect.y + guidanceRect.height) -
      Math.max(targetRect.y, guidanceRect.y),
  );
  return { area: overlapWidth * overlapHeight };
}

async function invokeSceneControl(
  page: import("@playwright/test").Page,
  action: "pause" | "resume",
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
