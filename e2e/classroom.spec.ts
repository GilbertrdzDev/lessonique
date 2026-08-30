import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("classroom shell", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/classroom");
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
    await page.getByRole("tab", { name: "script.js" }).click();
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
    await page.getByRole("tab", { name: "script.js" }).click();
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
    await expect(page.getByRole("tab", { name: "index.html" })).toBeVisible();
    await expect(page.getByText("Live Preview", { exact: true })).toBeVisible();

    const startedAt = Date.now();
    await profile.selectOption("profile.javascript-console");
    await expect(page.getByRole("tab", { name: "script.js" })).toBeVisible();
    expect(Date.now() - startedAt).toBeLessThan(1_000);
    await expect(page.getByRole("tab", { name: "index.html" })).toHaveCount(0);
    await expect(page.getByText("Live Preview", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("log", { name: "Runtime console" })).toBeVisible();

    await profile.selectOption("profile.vanilla-web");
    await expect(page.getByRole("tab", { name: "index.html" })).toBeVisible();
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
    await expect(page.getByRole("tab", { name: "script.js" })).toBeVisible();

    await page.reload();

    await expect(profile).toHaveValue("profile.javascript-console");
    await expect(page.getByRole("tab", { name: "script.js" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "index.html" })).toHaveCount(0);
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

    await page.getByRole("tab", { name: "index.html" }).click();
    await replaceActiveFile(
      '<!doctype html><html lang="en"><head><link rel="stylesheet" href="./styles.css"></head><body><button id="lessonique-demo">Waiting</button><script src="./script.js"></script></body></html>',
    );
    await page.getByRole("tab", { name: "styles.css" }).click();
    await replaceActiveFile(
      "#lessonique-demo { color: rgb(255, 0, 0); font-weight: 700; }",
    );
    await page.getByRole("tab", { name: "script.js" }).click();
    await replaceActiveFile(
      'document.querySelector("#lessonique-demo").textContent = "Preview updated"; console.log("workspace-ready");',
    );
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
