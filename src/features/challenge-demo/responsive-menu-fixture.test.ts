import { describe, expect, it } from "vitest";

import {
  createP0CodeIntelligenceRuntime,
  createP0ProviderPlatform,
} from "@/providers/p0";
import {
  createGuidedLessonInputSchema,
  inspectClassroomInputSchema,
  targetRefSchema,
} from "@/core/webmcp";

import {
  createResponsiveMenuLessonFixture,
  RESPONSIVE_MENU_DEMO_IDS,
  RESPONSIVE_MENU_INTERACTION_ANCHORS,
  RESPONSIVE_MENU_LESSON_FIXTURE,
  RESPONSIVE_MENU_TARGET_CATALOG,
} from "./responsive-menu-fixture";

describe("responsive menu challenge fixture", () => {
  it("creates a closed-schema three-file lesson with a validation-backed plan", () => {
    expect(() =>
      createGuidedLessonInputSchema.parse(RESPONSIVE_MENU_LESSON_FIXTURE),
    ).not.toThrow();
    expect(RESPONSIVE_MENU_LESSON_FIXTURE.files.map(({ path }) => path)).toEqual([
      "index.html",
      "styles.css",
      "script.js",
    ]);
    expect(RESPONSIVE_MENU_LESSON_FIXTURE.steps.map(({ id }) => id)).toEqual([
      RESPONSIVE_MENU_DEMO_IDS.htmlStep,
      RESPONSIVE_MENU_DEMO_IDS.accessibilityStep,
      RESPONSIVE_MENU_DEMO_IDS.cssStep,
      RESPONSIVE_MENU_DEMO_IDS.javascriptStep,
      RESPONSIVE_MENU_DEMO_IDS.verificationStep,
    ]);
    expect(
      RESPONSIVE_MENU_LESSON_FIXTURE.steps.every(
        ({ criteria, hints }) => (criteria?.length ?? 0) > 0 && (hints?.length ?? 0) > 0,
      ),
    ).toBe(true);
  });

  it("keeps preview interaction anchors stable across topic changes", () => {
    const trails = createResponsiveMenuLessonFixture("trails");
    const observatory = createResponsiveMenuLessonFixture("observatory");
    const trailHtml = trails.files.find(({ path }) => path === "index.html")!.content;
    const observatoryHtml = observatory.files.find(
      ({ path }) => path === "index.html",
    )!.content;

    expect(trailHtml).toContain("Trailbound");
    expect(observatoryHtml).toContain("Night Atlas");
    Object.values(RESPONSIVE_MENU_INTERACTION_ANCHORS).forEach((anchorId) => {
      expect(trailHtml).toContain(`data-lessonique-anchor="${anchorId}"`);
      expect(observatoryHtml).toContain(`data-lessonique-anchor="${anchorId}"`);
    });
  });

  it("declares only closed semantic source queries and registered targets", () => {
    Object.values(RESPONSIVE_MENU_TARGET_CATALOG).forEach((entry) => {
      if (entry.kind === "source") {
        expect(() =>
          inspectClassroomInputSchema.parse({
            include: ["anchors"],
            anchorQuery: entry.query,
          }),
        ).not.toThrow();
      } else {
        expect(() => targetRefSchema.parse(entry.target)).not.toThrow();
      }
    });
    expect(JSON.stringify(RESPONSIVE_MENU_TARGET_CATALOG)).not.toMatch(
      /cssSelector|rawSelector|xpath|domPath|coordinates/iu,
    );
  });

  it("resolves each source catalog entry through the registered providers", async () => {
    const runtime = createP0CodeIntelligenceRuntime(createP0ProviderPlatform(), {
      debounceMs: 0,
    });
    const files = new Map(
      RESPONSIVE_MENU_LESSON_FIXTURE.files.map((file) => [file.path, file]),
    );

    for (const entry of Object.values(RESPONSIVE_MENU_TARGET_CATALOG)) {
      if (entry.kind !== "source") continue;
      const filePath = String(entry.query.input.filePath);
      const file = files.get(filePath)!;
      const result = await runtime.service.query({
        document: {
          path: file.path,
          languageId: file.languageId,
          content: file.content,
          revision: 1,
        },
        locator: {
          locatorId: entry.query.resolverId,
          input: Object.fromEntries(
            Object.entries(entry.query.input).filter(([key]) => key !== "filePath"),
          ),
        },
        representation: entry.representation,
      });

      expect(result.anchors).toHaveLength(1);
      expect(result.targets).toEqual([
        expect.objectContaining({ representation: entry.representation }),
      ]);
    }
    runtime.dispose();
  });
});
