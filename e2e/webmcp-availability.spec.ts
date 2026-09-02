import { expect, test, type Page } from "@playwright/test";

type RegisteredTool = Readonly<{
  name: string;
  execute: (input: unknown) => Promise<unknown>;
}>;

test.describe("Lessonique WebMCP experience states", () => {
  test("keeps the lobby disconnected while tool registration is pending", async ({
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

    await page.goto("/");

    await expectExperienceState(page, "supported-disconnected");
    await expectCompanionVisualState(page, "thinking", "normal");
    await expect(
      page.getByRole("heading", { name: "Waiting for your AI guide" }),
    ).toBeVisible();
    await expect(page.getByText("Detecting connection...", { exact: true })).toBeVisible();
    await expectNoClassroom(page);
  });

  test("does not mistake registered tools for an agent connection", async ({
    page,
  }) => {
    await installCapturedWebMCP(page);
    await page.goto("/");

    await expectRegisteredToolCount(page, 13);
    await expectExperienceState(page, "supported-disconnected");
    await expectCompanionVisualState(page, "thinking", "normal");
    await expect(
      page.getByText("Looking for WebMCP connection", { exact: true }),
    ).toHaveCount(2);
    await expect(
      page.getByText("Connected through WebMCP", { exact: true }),
    ).toHaveCount(0);
    await expectNoClassroom(page);
  });

  test("moves to connected only after a real registered-tool invocation", async ({
    page,
  }) => {
    await installCapturedWebMCP(page);
    await page.goto("/");
    await expectRegisteredToolCount(page, 13);

    const result = await invokeRegisteredTool(page, "get_system_capabilities", {
      include: ["profiles"],
    });

    expect(result).toEqual(expect.objectContaining({ ok: true }));
    await expectExperienceState(page, "connected");
    await expectCompanionVisualState(page, "connected", "normal");
    await expectSharedHoverWaveAndNormalShadow(page);
    await expect(
      page.getByText("Connected through WebMCP", { exact: true }),
    ).toHaveCount(2);
    await expect(page.getByText("AI guide is ready", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Tell ChatGPT what you want to learn", { exact: true }),
    ).toBeVisible();
    await expectNoClassroom(page);
  });

  test("renders the isolated 16-frame construction sprite across live build stages", async ({
    page,
  }) => {
    await installCapturedWebMCP(page);
    await page.goto("/");
    await expectRegisteredToolCount(page, 13);

    const understanding = await invokeRegisteredTool(
      page,
      "set_guide_build_status",
      {
        status: "building",
        stage: "understanding-goal",
        message: "Mapping your learning goal",
      },
    );

    expect(understanding).toEqual(expect.objectContaining({ ok: true }));
    await expectExperienceState(page, "building-guide");
    const companion = persistentCompanionHost(page);
    const constructionPet = companion.locator('[data-slot="construction-pet"]');
    await expect(companion).toHaveAttribute(
      "data-companion-renderer",
      "construction-sprite",
    );
    await expect(constructionPet).toHaveAttribute(
      "data-builder-step",
      "1",
    );
    await expect(constructionPet).toHaveAttribute("data-frame-count", "16");
    await expect(constructionPet).toHaveAttribute("data-animation-mode", "loop");
    await expect(
      page.getByRole("heading", { name: "Building your AI guide..." }),
    ).toBeVisible();
    await expect(
      page.locator('[data-guide-build-status="building"]'),
    ).toHaveAttribute("data-guide-build-stage", "understanding-goal");
    await expect(
      page.locator('[data-build-stage-state="active"]'),
    ).toContainText("Understanding your goal");
    await expect(constructionPet).toHaveCSS(
      "background-image",
      /construction-pet-sprite\.webp/u,
    );
    expect(
      await page.evaluate(() =>
        performance
          .getEntriesByType("resource")
          .some(
            (entry) =>
              new URL(entry.name).pathname ===
              "/images/companion/construction-pet-sprite-32f.webp",
          ),
      ),
    ).toBe(false);
    const observedFrames = await constructionPet.evaluate(
      (element) =>
        new Promise<number[]>((resolve) => {
          const frames: number[] = [];
          let timeout = 0;
          const observer = new MutationObserver(capture);

          function finish() {
            window.clearTimeout(timeout);
            observer.disconnect();
            resolve(frames);
          }

          function capture() {
            const frame = Number(
              (element as HTMLElement).dataset.spriteFrame ?? "-1",
            );
            if (frames.at(-1) !== frame) frames.push(frame);
            if (new Set(frames).size === 16 && frame === 0) finish();
          }

          timeout = window.setTimeout(finish, 8_000);
          observer.observe(element, {
            attributeFilter: ["data-sprite-frame"],
            attributes: true,
          });
          capture();
        }),
    );
    const uniqueFrames = new Set(observedFrames);
    expect(uniqueFrames.size).toBeGreaterThanOrEqual(15);
    expect([...uniqueFrames].every((frame) => frame >= 0 && frame < 16)).toBe(
      true,
    );
    expect([...uniqueFrames]).toEqual(
      expect.arrayContaining([0, 3, 6, 7, 8, 12, 15]),
    );

    const originalConstructionNode = await constructionPet.elementHandle();
    await page.waitForFunction(() => {
      const frame = Number(
        document.querySelector<HTMLElement>('[data-slot="construction-pet"]')
          ?.dataset.spriteFrame ?? "-1",
      );
      return frame >= 3 && frame <= 6;
    });
    const frameBeforePreparing = Number(
      await constructionPet.getAttribute("data-sprite-frame"),
    );

    const preparing = await invokeRegisteredTool(
      page,
      "set_guide_build_status",
      {
        status: "building",
        stage: "preparing-lesson",
        message: "Preparing examples and practice",
      },
    );

    expect(preparing).toEqual(expect.objectContaining({ ok: true }));
    expect(
      await originalConstructionNode?.evaluate((element) => element.isConnected),
    ).toBe(true);
    expect(Number(await constructionPet.getAttribute("data-sprite-frame"))).toBeGreaterThanOrEqual(
      frameBeforePreparing,
    );
    await expect(constructionPet).toHaveAttribute(
      "data-builder-step",
      "2",
    );
    await expect(
      page.locator('[data-build-stage-state="complete"]'),
    ).toContainText("Understanding your goal");
    await expect(
      page.locator('[data-build-stage-state="active"]'),
    ).toContainText("Preparing the lesson");
    await expect(
      page.locator('[data-build-stage-state="pending"]'),
    ).toContainText("Setting up the classroom");
    await page.waitForFunction(() => {
      const frame = Number(
        document.querySelector<HTMLElement>('[data-slot="construction-pet"]')
          ?.dataset.spriteFrame ?? "-1",
      );
      return frame >= 9 && frame <= 12;
    });
    const frameBeforeSettingUp = Number(
      await constructionPet.getAttribute("data-sprite-frame"),
    );

    const settingUp = await invokeRegisteredTool(
      page,
      "set_guide_build_status",
      {
        status: "building",
        stage: "setting-up-classroom",
        message: "Configuring the classroom",
      },
    );

    expect(settingUp).toEqual(expect.objectContaining({ ok: true }));
    expect(
      await originalConstructionNode?.evaluate((element) => element.isConnected),
    ).toBe(true);
    expect(Number(await constructionPet.getAttribute("data-sprite-frame"))).toBeGreaterThanOrEqual(
      frameBeforeSettingUp,
    );
    await expect(constructionPet).toHaveAttribute(
      "data-builder-step",
      "3",
    );
    await expect(
      page.locator('[data-build-stage-state="complete"]'),
    ).toHaveCount(2);
    await expect(
      page.locator('[data-build-stage-state="active"]'),
    ).toContainText("Setting up the classroom");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });

  test("keeps the construction sprite clipped across four viewport classes", async ({
    page,
  }) => {
    await installCapturedWebMCP(page);
    await page.goto("/");
    await expectRegisteredToolCount(page, 13);
    await invokeRegisteredTool(page, "set_guide_build_status", {
      status: "building",
      stage: "understanding-goal",
    });

    const constructionPet = persistentCompanionHost(page).locator(
      '[data-slot="construction-pet"]',
    );
    const viewports = [
      { expectedPetWidth: 336, height: 1_080, label: "desktop", width: 1_728 },
      { expectedPetWidth: 336, height: 768, label: "laptop", width: 1_366 },
      { expectedPetWidth: 336, height: 1_024, label: "tablet", width: 768 },
      { expectedPetWidth: 264, height: 844, label: "mobile", width: 390 },
    ] as const;

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await expect(constructionPet, viewport.label).toBeVisible();
      const box = await constructionPet.boundingBox();
      expect(box, viewport.label).not.toBeNull();
      expect(box!.width, viewport.label).toBeCloseTo(
        viewport.expectedPetWidth,
        0,
      );
      expect(box!.width / box!.height, viewport.label).toBeCloseTo(362 / 320, 2);
      await expect(constructionPet, viewport.label).toHaveCSS(
        "background-size",
        "400% 400%",
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        viewport.label,
      ).toBe(true);
    }
  });

  test("keeps the construction sprite static with reduced motion", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installCapturedWebMCP(page);
    await page.goto("/");
    await expectRegisteredToolCount(page, 13);
    await invokeRegisteredTool(page, "set_guide_build_status", {
      status: "building",
      stage: "understanding-goal",
    });

    const constructionPet = persistentCompanionHost(page).locator(
      '[data-slot="construction-pet"]',
    );
    await expect(constructionPet).toHaveAttribute("data-animation-mode", "static");
    await expect(constructionPet).toHaveAttribute("data-sprite-frame", "0");
    await page.waitForTimeout(700);
    await expect(constructionPet).toHaveAttribute("data-sprite-frame", "0");
  });

  test("unmounts the construction sprite when classroom creation fails", async ({
    page,
  }) => {
    await installCapturedWebMCP(page);
    await page.goto("/");
    await expectRegisteredToolCount(page, 13);
    await invokeRegisteredTool(page, "set_guide_build_status", {
      status: "building",
      stage: "understanding-goal",
    });
    await expect(page.locator('[data-slot="construction-pet"]')).toHaveCount(1);

    const result = await invokeRegisteredTool(page, "create_guided_lesson", {
      lessonId: "lesson.invalid-construction",
      lessonMode: "explain",
      title: "Invalid construction lesson",
      objective: "Verify that failed classroom setup stops construction motion.",
      environment: {
        profileId: "profile.javascript-console",
        languageIds: ["language.javascript"],
        activeFile: "script.js",
        activeSurfaceId: "editor",
        surfaces: [
          {
            id: "editor",
            options: [{ optionId: "editor.font-size", value: 200 }],
          },
        ],
      },
      files: [
        {
          path: "script.js",
          languageId: "language.javascript",
          content: "const invalidConstruction = true;",
        },
      ],
      steps: [
        {
          id: "step.invalid-construction",
          title: "Trigger rollback",
          objective: "Keep the previous or idle classroom valid.",
        },
      ],
    });

    expect(result).toEqual(expect.objectContaining({ ok: false }));
    await expectExperienceState(page, "guide-build-error");
    await expect(page.locator('[data-slot="construction-pet"]')).toHaveCount(0);
    await expect(persistentCompanionHost(page)).toHaveAttribute(
      "data-companion-renderer",
      "standard",
    );
  });

  test("builds the classroom in the same root document after ChatGPT starts a lesson", async ({
    page,
  }) => {
    await installCapturedWebMCP(page);
    await page.goto("/");
    await expectRegisteredToolCount(page, 13);
    await invokeRegisteredTool(page, "set_guide_build_status", {
      status: "building",
      stage: "understanding-goal",
    });
    await expect(page.locator('[data-slot="construction-pet"]')).toHaveCount(1);

    const result = await invokeRegisteredTool(page, "create_guided_lesson", {
      lessonId: "lesson.root-transition",
      lessonMode: "explain",
      title: "Root transition lesson",
      objective: "Open a real classroom without navigating away from the root route.",
      environment: {
        profileId: "profile.javascript-console",
        languageIds: ["language.javascript"],
        activeFile: "script.js",
        activeSurfaceId: "editor",
      },
      files: [
        {
          path: "script.js",
          languageId: "language.javascript",
          content: "const rootTransition = true;",
        },
      ],
      steps: [
        {
          id: "step.root-transition",
          title: "Verify the root transition",
          objective: "Confirm the real workspace opens on the same route.",
        },
      ],
    });

    expect(result).toEqual(expect.objectContaining({ ok: true }));
    await expectExperienceState(page, "starting-session");
    await expect(page.locator('[data-slot="construction-pet"]')).toHaveCount(0);
    await expectExperienceState(page, "classroom", 10_000);
    await expectCompanionVisualState(page, "idle", "normal");
    await expect(page).toHaveURL(/\/$/u);
    await expect(
      page.getByRole("main", { name: "Lessonique Classroom" }),
    ).toBeVisible();
    await expect(
      page.getByRole("complementary", { name: "Project Files" }),
    ).toBeVisible();
    await expect(
      page.getByRole("complementary", { name: "Learning agent" }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Learning Plan" }),
    ).toContainText("Verify the root transition");
    await expect(
      page.getByRole("complementary", { name: "Primary navigation" }),
    ).toHaveCount(0);
  });

  test("shows one unsupported lobby without mounting classroom resources", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(document, "modelContext", {
        configurable: true,
        value: undefined,
      });
    });

    await page.goto("/");

    await expectExperienceState(page, "unsupported");
    await expectCompanionVisualState(page, "incompatible", "incompatible");
    await expect(
      persistentCompanion(page).locator(".companion-character-image"),
    ).toHaveAttribute("src", /lessonique-companion-incompatible/u);
    await expectIndependentIncompatibleMotion(page);
    await expectSharedHoverWaveAndNormalShadow(page);
    await expect(
      page
        .locator('[data-lobby-state="unsupported"]')
        .getByText("Browser not compatible", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("WebMCP unavailable in this browser", { exact: true }),
    ).toBeVisible();
    await expectNoClassroom(page);
    await expect(page.locator('[data-slot="webmcp-dev-panel"]')).toHaveCount(0);
  });

  test("keeps the incompatible composition static with reduced motion", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => {
      Object.defineProperty(document, "modelContext", {
        configurable: true,
        value: undefined,
      });
    });

    await page.goto("/");

    await expectExperienceState(page, "unsupported");
    await expectCompanionVisualState(page, "incompatible", "incompatible");
    const companion = persistentCompanion(page);
    for (const selector of [
      ".companion-character-stage",
      ".companion-ground-shadow",
      ".companion-hover-ring-upper",
      ".companion-limb-left",
      ".body-glitch-slice-a",
      ".interference-a",
    ]) {
      await expect(companion.locator(selector)).toHaveCSS(
        "animation-name",
        "none",
      );
    }
    await expect(companion.locator(".companion-ground-shadow")).toHaveCSS(
      "opacity",
      "0.82",
    );
    await expect(companion.locator(".companion-hover-ring-upper")).toHaveCSS(
      "opacity",
      "0.82",
    );
    await expect(companion.locator(".body-glitch-slice-a")).toHaveCSS(
      "opacity",
      "0",
    );
    await expect(companion.locator(".interference-a")).toHaveCSS(
      "opacity",
      "0.3",
    );
  });

  test("keeps the normal shared waves and shadow static with reduced motion", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installCapturedWebMCP(page);
    await page.goto("/");
    await expectRegisteredToolCount(page, 13);
    await invokeRegisteredTool(page, "get_system_capabilities", {
      include: ["profiles"],
    });

    await expectExperienceState(page, "connected");
    await expectCompanionVisualState(page, "connected", "normal");
    const companion = persistentCompanion(page);
    for (const selector of [
      ".companion-ground-shadow",
      ".companion-hover-ring-upper",
      ".companion-hover-ring-lower",
      ".companion-hover-spark",
    ]) {
      await expect(companion.locator(selector)).toHaveCSS(
        "animation-name",
        "none",
      );
    }
    await expect(companion.locator(".companion-ground-shadow")).toHaveCSS(
      "background-image",
      /lessonique-companion-normal\.png/u,
    );
    await expect(companion.locator(".companion-ground-shadow")).toHaveCSS(
      "opacity",
      "0.86",
    );
    await expect(companion.locator(".companion-hover-ring-upper")).toHaveCSS(
      "opacity",
      "0.9",
    );
  });

  test("does not report a connection when WebMCP registration fails", async ({
    page,
  }) => {
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

    await page.goto("/");

    await expectExperienceState(page, "unsupported");
    await expectCompanionVisualState(page, "incompatible", "incompatible");
    await expect(
      page.getByText("Connected through WebMCP", { exact: true }),
    ).toHaveCount(0);
    await expectNoClassroom(page);
  });

  test("detects WebMCP support dynamically without a page refresh", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const registeredTools: RegisteredTool[] = [];
      Object.defineProperty(window, "__lessoniqueRegisteredTools", {
        configurable: true,
        value: registeredTools,
      });
      Object.defineProperty(document, "modelContext", {
        configurable: true,
        writable: true,
        value: undefined,
      });
    });
    await page.goto("/");
    await expectExperienceState(page, "unsupported");
    await expectCompanionVisualState(page, "incompatible", "incompatible");

    await page.evaluate(() => {
      const tools = (
        window as typeof window & {
          __lessoniqueRegisteredTools: RegisteredTool[];
        }
      ).__lessoniqueRegisteredTools;
      Object.defineProperty(document, "modelContext", {
        configurable: true,
        value: {
          registerTool: async (tool: RegisteredTool) => {
            tools.push(tool);
          },
        },
      });
      window.dispatchEvent(new Event("focus"));
    });

    await expectRegisteredToolCount(page, 13);
    await expectExperienceState(page, "supported-disconnected");
    await expectCompanionVisualState(page, "thinking", "normal");
    await invokeRegisteredTool(page, "get_system_capabilities", {
      include: ["profiles"],
    });
    await expectExperienceState(page, "connected");
    await expectCompanionVisualState(page, "connected", "normal");
  });

  test("redirects the legacy classroom URL to the canonical root", async ({
    page,
  }) => {
    await page.goto("/classroom");

    await expect(page).toHaveURL(/\/$/u);
  });
});

async function installCapturedWebMCP(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const registeredTools: RegisteredTool[] = [];
    Object.defineProperty(window, "__lessoniqueRegisteredTools", {
      configurable: true,
      value: registeredTools,
    });
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: {
        registerTool: async (tool: RegisteredTool) => {
          registeredTools.push(tool);
        },
      },
    });
  });
}

function persistentCompanion(page: Page) {
  return page.locator(
    '[data-companion-experience-state] .lessonique-companion',
  );
}

function persistentCompanionHost(page: Page) {
  return page.locator('[data-slot="persistent-companion"]');
}

async function expectIndependentIncompatibleMotion(page: Page): Promise<void> {
  const companion = persistentCompanion(page);
  const animationContracts = [
    [".companion-character-stage", "lessonique-companion-error-body-float"],
    [".companion-ground-shadow", "lessonique-companion-error-shadow"],
    [".companion-hover-ring-upper", "lessonique-companion-error-ring-upper"],
    [".companion-hover-ring-lower", "lessonique-companion-error-ring-lower"],
    [".companion-limb-left", "lessonique-companion-error-left-limb"],
    [".companion-limb-right", "lessonique-companion-error-right-limb"],
    [".companion-eye-glimmer-left", "lessonique-companion-error-eye-look"],
    [".companion-eye-glimmer-right", "lessonique-companion-error-eye-glitch"],
    [".body-glitch-slice-a", "lessonique-companion-error-body-slice-a"],
    [".interference-a", "lessonique-companion-error-interference-a"],
  ] as const;

  for (const [selector, animationName] of animationContracts) {
    await expect(companion.locator(selector)).toHaveCSS(
      "animation-name",
      animationName,
    );
  }
}

async function expectSharedHoverWaveAndNormalShadow(
  page: Page,
): Promise<void> {
  const companion = persistentCompanion(page);
  const waveAnimations = [
    [".companion-hover-ring-upper", "lessonique-companion-error-ring-upper"],
    [".companion-hover-ring-lower", "lessonique-companion-error-ring-lower"],
    [".companion-hover-spark", "lessonique-companion-error-hover-spark"],
  ] as const;

  for (const [selector, animationName] of waveAnimations) {
    await expect(companion.locator(selector)).toHaveCSS(
      "animation-name",
      animationName,
    );
  }
  await expect(companion.locator(".companion-ground-shadow")).toHaveCSS(
    "background-image",
    /lessonique-companion-normal\.png/u,
  );
}

async function expectCompanionVisualState(
  page: Page,
  visualState: string,
  asset: "normal" | "incompatible",
): Promise<void> {
  const companion = persistentCompanion(page);
  await expect(companion).toHaveAttribute(
    "data-companion-visual-state",
    visualState,
  );
  await expect(companion).toHaveAttribute("data-companion-asset", asset);
}

async function expectRegisteredToolCount(
  page: Page,
  count: number,
): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              __lessoniqueRegisteredTools: RegisteredTool[];
            }
          ).__lessoniqueRegisteredTools.length,
      ),
    )
    .toBe(count);
}

async function invokeRegisteredTool(
  page: Page,
  name: string,
  input: unknown,
): Promise<unknown> {
  return page.evaluate(async ({ toolName, toolInput }) => {
    const tools = (
      window as typeof window & {
        __lessoniqueRegisteredTools: RegisteredTool[];
      }
    ).__lessoniqueRegisteredTools;
    const tool = tools.find(
      ({ name: registeredName }) => registeredName === toolName,
    );
    if (!tool) {
      throw new Error(`Registered WebMCP tool "${toolName}" is unavailable.`);
    }
    return tool.execute(toolInput);
  }, { toolInput: input, toolName: name });
}

async function expectExperienceState(
  page: Page,
  expected: string,
  timeout = 5_000,
): Promise<void> {
  await expect(
    page.locator('[data-slot="lessonique-experience"]'),
  ).toHaveAttribute("data-experience-state", expected, { timeout });
}

async function expectNoClassroom(page: Page): Promise<void> {
  await expect(
    page.getByRole("main", { name: "Lessonique Classroom" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("complementary", { name: "Project Files" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("complementary", { name: "Learning agent" }),
  ).toHaveCount(0);
  await expect(page.getByText("index.html", { exact: true })).toHaveCount(0);
}
