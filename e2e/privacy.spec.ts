import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { createArrayMapLessonFixture } from "../src/features/challenge-demo/array-map-fixture";

// An optional captured deployment script verifies the same scenarios against Vercel's runtime.
const analyticsScript = process.env.VERCEL_ANALYTICS_TEST_SCRIPT
  ? readFileSync(process.env.VERCEL_ANALYTICS_TEST_SCRIPT, "utf8")
  : `(() => {
    let filter = event => event;
    window.va = (command, input) => {
      if (command === 'beforeSend') filter = input;
      if (command === 'pageview') {
        const event = filter({ type: 'pageview', url: location.href });
        if (event) fetch('/_vercel/insights/view', { method: 'POST', body: JSON.stringify({ o: event.url }) });
      }
    };
    (window.vaq || []).forEach(([command, input]) => window.va(command, input));
  })();`;

async function requestPageView(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { va?: (command: string, input: unknown) => void }).va?.("pageview", { path: location.pathname, route: location.pathname });
  });
}

test.describe("privacy consent", () => {
  let scripts: number;
  let events: Array<Record<string, unknown>>;

  test.beforeEach(async ({ context }) => {
    scripts = 0;
    events = [];
    await context.addInitScript(() => {
      // Vercel intentionally ignores automated visitors; exercise real tracking in this test only.
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      const userAgent = navigator.userAgent.replace("HeadlessChrome", "Chrome");
      Object.defineProperty(navigator, "userAgent", { get: () => userAgent });
      (window as unknown as { privacyRegisteredTools: string[] }).privacyRegisteredTools = [];
      (window as unknown as { privacyTools: unknown[] }).privacyTools = [];
      Object.defineProperty(document, "modelContext", {
        configurable: true,
        value: { registerTool: async (tool: { name: string }) => {
          (window as unknown as { privacyRegisteredTools: string[] }).privacyRegisteredTools.push(tool.name);
          (window as unknown as { privacyTools: unknown[] }).privacyTools.push(tool);
        } },
      });
    });
    await context.route("**/_vercel/insights/script.js", async (route) => {
      scripts += 1;
      await route.fulfill({ contentType: "application/javascript", body: analyticsScript });
    });
    await context.route(/\/_vercel\/insights\/(view|event|session|identify|group)(\?|$)/, async (route) => {
      events.push(route.request().postDataJSON() ?? {});
      await route.fulfill({ status: 204 });
    });
  });

  test("rejects and dismisses without loading analytics or blocking the classroom", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Decide later" }).click();
    await expect(page.getByRole("button", { name: "Privacy settings" })).toBeVisible();
    expect(scripts).toBe(0);
    await page.getByRole("button", { name: "Privacy settings" }).click();
    await page.getByRole("button", { name: "Reject analytics" }).click();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.reload();
    await expect(page.getByRole("button", { name: "Privacy settings" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Analytics choice" })).toHaveCount(0);
    expect(scripts).toBe(0);
    expect(events).toEqual([]);
  });

  test("sends sanitized page views after accepting and blocks them after withdrawal", async ({ page }) => {
    await page.goto("/privacy?email=private@example.test#secret");
    await page.getByRole("button", { name: "Accept analytics" }).click();
    await expect.poll(() => events.length).toBeGreaterThan(0);
    expect(events[0].o).toBe(new URL("/privacy", page.url()).href);
    expect(scripts).toBe(1);
    await page.getByRole("button", { name: "Privacy settings" }).click();
    await page.getByRole("button", { name: "Reject analytics" }).click();
    const count = events.length;
    await requestPageView(page);
    await page.waitForTimeout(200);
    expect(events.length).toBe(count);
    await page.reload();
    await expect(page.getByRole("button", { name: "Privacy settings" })).toBeVisible();
    expect(scripts).toBe(1);
  });

  test("withdrawal synchronizes across tabs and legal pages register no teaching tools", async ({ page, context }) => {
    await page.goto("/privacy");
    await page.getByRole("button", { name: "Accept analytics" }).click();
    await expect.poll(() => events.length).toBeGreaterThan(0);
    const second = await context.newPage();
    await second.goto("/storage");
    await second.getByRole("button", { name: "Privacy settings" }).click();
    await expect(second.getByRole("status")).toContainText("accepted");
    await second.getByRole("button", { name: "Reject analytics" }).click();
    await page.getByRole("button", { name: "Privacy settings" }).click();
    await expect(page.getByRole("status")).toContainText("rejected");
    const count = events.length;
    await requestPageView(page);
    await requestPageView(second);
    await page.waitForTimeout(200);
    expect(events.length).toBe(count);
    for (const legalPage of [page, second]) {
      expect(await legalPage.evaluate(() => (window as unknown as { privacyRegisteredTools: string[] }).privacyRegisteredTools)).toEqual([]);
    }
  });

  test("expired and malformed preferences require a new choice", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("lessonique.privacy.v1", JSON.stringify({ choice: "accepted", noticeVersion: "1", decidedAt: 0, expiresAt: 1 })));
    await page.goto("/storage");
    await expect(page.getByRole("region", { name: "Analytics choice" })).toBeVisible();
    expect(scripts).toBe(0);
  });

  test("blocked storage keeps a choice for the current page session only", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "localStorage", { get: () => { throw new Error("Storage unavailable"); } });
    });
    await page.goto("/privacy");
    await page.getByRole("button", { name: "Accept analytics" }).click();
    await expect.poll(() => events.length).toBeGreaterThan(0);
    await page.getByRole("button", { name: "Privacy settings" }).click();
    await expect(page.getByText("Your browser could not save this preference.", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Reject analytics" }).click();
    const count = events.length;
    await requestPageView(page);
    await page.waitForTimeout(200);
    expect(events.length).toBe(count);
    await page.reload();
    await expect(page.getByRole("region", { name: "Analytics choice" })).toBeVisible();
  });

  test("classroom deletion clears persisted code and progress without resaving them", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Reject analytics" }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { privacyTools: unknown[] }).privacyTools.length)).toBe(13);
    const result = await page.evaluate(async (fixture) => {
      const tools = (window as unknown as { privacyTools: Array<{ name: string; execute: (input: unknown) => Promise<unknown> }> }).privacyTools;
      return tools.find(({ name }) => name === "create_guided_lesson")?.execute(JSON.parse(fixture));
    }, JSON.stringify(createArrayMapLessonFixture()));
    expect(result).toMatchObject({ ok: true });
    await expect.poll(() => page.evaluate(() => Boolean(localStorage.getItem("lessonique.workspace.v1") && sessionStorage.getItem("lessonique.lesson.v1")))).toBe(true);
    await page.evaluate(() => localStorage.setItem("lessonique-theme", "light"));
    await page.getByRole("button", { name: "Privacy settings" }).click();
    await page.getByRole("button", { name: "Clear classroom data", exact: true }).click();
    await page.getByRole("button", { name: "Confirm clear classroom data" }).click();
    await expect(page.getByText("Classroom data cleared from this tab.", { exact: false })).toBeVisible();
    await expect.poll(() => page.evaluate(() => [localStorage.getItem("lessonique.workspace.v1"), sessionStorage.getItem("lessonique.lesson.v1")])).toEqual([null, null]);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("lessonique.privacy.v1")!).choice)).toBe("rejected");
    expect(await page.evaluate(() => localStorage.getItem("lessonique-theme"))).toBe("light");
    await page.reload();
    await expect(page.locator('[data-slot="workspace-body"]')).toHaveCount(0);
    expect(await page.evaluate(() => [localStorage.getItem("lessonique.workspace.v1"), sessionStorage.getItem("lessonique.lesson.v1")])).toEqual([null, null]);
  });

  test("legal pages and keyboard privacy controls are accessible on both viewport sizes", async ({ page }, testInfo) => {
    await page.goto("/storage");
    await page.getByRole("button", { name: "Reject analytics" }).click();
    await expect(page.getByRole("heading", { name: "Storage & Analytics", exact: true })).toBeVisible();
    const trigger = page.getByRole("button", { name: "Privacy settings" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("privacy-settings.png") });
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test("clears the active classroom even if browser storage becomes unavailable", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Reject analytics" }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { privacyTools: unknown[] }).privacyTools.length)).toBe(13);
    const result = await page.evaluate(async (fixture) => {
      const tools = (window as unknown as { privacyTools: Array<{ name: string; execute: (input: unknown) => Promise<unknown> }> }).privacyTools;
      return tools.find(({ name }) => name === "create_guided_lesson")?.execute(JSON.parse(fixture));
    }, JSON.stringify(createArrayMapLessonFixture()));
    expect(result).toMatchObject({ ok: true });
    await expect(page.locator('[data-slot="workspace-body"]')).toBeVisible();
    await page.evaluate(() => Object.defineProperty(window, "localStorage", { get: () => { throw new Error("Storage blocked"); } }));
    await page.getByRole("button", { name: "Privacy settings" }).click();
    await page.getByRole("button", { name: "Clear classroom data", exact: true }).click();
    await page.getByRole("button", { name: "Confirm clear classroom data" }).click();
    await expect(page.getByText("The active classroom was reset,", { exact: false })).toBeVisible();
    await expect(page.locator('[data-slot="workspace-body"]')).toHaveCount(0);
    expect(await page.evaluate(() => sessionStorage.getItem("lessonique.lesson.v1"))).toBeNull();
  });
});
