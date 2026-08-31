import { expect, test, type Page } from "@playwright/test";

test.describe("WebMCP availability presentation", () => {
  test("keeps every classroom indicator neutral while registration is pending", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(document, "modelContext", {
        configurable: true,
        value: {
          registerTool: () => new Promise<void>(() => undefined),
        },
      });
    });

    await page.goto("/classroom");

    await expectConsistentAvailability(page, "detecting");
    await expect(page.getByText("Detecting WebMCP", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("WebMCP Ready", { exact: true })).toHaveCount(0);
    await expect(
      page.getByText("Connected through WebMCP", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.locator('[data-webmcp-status-tone="ready"]'),
    ).toHaveCount(0);
  });

  test("shows ready indicators only after every WebMCP tool registers", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(document, "modelContext", {
        configurable: true,
        value: {
          registerTool: async () => undefined,
        },
      });
    });

    await page.goto("/classroom");

    await expectConsistentAvailability(page, "ready");
    await expect(page.getByText("WebMCP Ready", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Connected through WebMCP", { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText("Detected Capabilities", { exact: true })).toBeVisible();
    await expect(
      page.locator('[data-webmcp-status-tone="ready"]').first(),
    ).toBeVisible();
  });

  test("shows one consistent unsupported state when the browser has no WebMCP", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(document, "modelContext", {
        configurable: true,
        value: undefined,
      });
    });

    await page.goto("/classroom");

    await expectConsistentAvailability(page, "unsupported");
    await expect(page.getByText("WebMCP Unsupported", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Capabilities Unavailable", { exact: true })).toBeVisible();
    await expect(
      page.getByText("WebMCP is unsupported in this browser", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("WebMCP Ready", { exact: true })).toHaveCount(0);
    await expect(
      page.getByText("Connected through WebMCP", { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByText("Understand the objective", { exact: true })).toHaveCount(0);
    await expect(
      page.locator('[data-webmcp-status-tone="ready"]'),
    ).toHaveCount(0);
    await expect(page.locator('[data-slot="webmcp-dev-panel"]')).toBeAttached();
  });

  test("does not report ready when WebMCP registration fails", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(document, "modelContext", {
        configurable: true,
        value: {
          registerTool: async () => {
            throw new DOMException("Registration blocked", "NotAllowedError");
          },
        },
      });
    });

    await page.goto("/classroom");

    await expectConsistentAvailability(page, "unsupported");
    await expect(page.getByText("WebMCP Ready", { exact: true })).toHaveCount(0);
    await expect(
      page.locator('[data-webmcp-status-tone="ready"]'),
    ).toHaveCount(0);
  });
});

async function expectConsistentAvailability(
  page: Page,
  expected: "detecting" | "ready" | "unsupported",
) {
  await expect
    .poll(() =>
      page.locator("[data-webmcp-availability]").evaluateAll((elements) => [
        ...new Set(
          elements.map((element) =>
            element.getAttribute("data-webmcp-availability"),
          ),
        ),
      ]),
    )
    .toEqual([expected]);
}
