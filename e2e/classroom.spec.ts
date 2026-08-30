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
});
