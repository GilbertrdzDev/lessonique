import { describe, expect, it } from "vitest";

import {
  createGuidedLessonInputSchema,
  inspectClassroomInputSchema,
  targetRefSchema,
} from "@/core/webmcp";
import {
  createP0CodeIntelligenceRuntime,
  createP0ProviderPlatform,
} from "@/providers/p0";

import {
  ARRAY_MAP_DEMO_IDS,
  ARRAY_MAP_LESSON_FIXTURE,
  ARRAY_MAP_TARGET_CATALOG,
} from "./array-map-fixture";

describe("Array.map challenge fixture", () => {
  it("creates a JavaScript-only console lesson with validation-backed steps", () => {
    expect(() =>
      createGuidedLessonInputSchema.parse(ARRAY_MAP_LESSON_FIXTURE),
    ).not.toThrow();
    expect(ARRAY_MAP_LESSON_FIXTURE.environment).toEqual(
      expect.objectContaining({
        profileId: "profile.javascript-console",
        languageIds: ["language.javascript"],
        activeFile: "script.js",
        activeSurfaceId: "console",
      }),
    );
    expect(ARRAY_MAP_LESSON_FIXTURE.files).toEqual([
      expect.objectContaining({
        path: "script.js",
        languageId: "language.javascript",
      }),
    ]);
    expect(ARRAY_MAP_LESSON_FIXTURE.steps.map(({ id }) => id)).toEqual([
      ARRAY_MAP_DEMO_IDS.mapStep,
      ARRAY_MAP_DEMO_IDS.outputStep,
    ]);
    expect(JSON.stringify(ARRAY_MAP_LESSON_FIXTURE)).not.toMatch(
      /voice|audio|speech|ssml/iu,
    );
  });

  it("declares a closed source locator and registered console target", () => {
    expect(() =>
      inspectClassroomInputSchema.parse({
        include: ["anchors"],
        anchorQuery: ARRAY_MAP_TARGET_CATALOG.mapCall.query,
      }),
    ).not.toThrow();
    expect(() =>
      targetRefSchema.parse(ARRAY_MAP_TARGET_CATALOG.console.target),
    ).not.toThrow();
    expect(JSON.stringify(ARRAY_MAP_TARGET_CATALOG)).not.toMatch(
      /cssSelector|rawSelector|xpath|domPath|coordinates/iu,
    );
  });

  it("resolves scores.map through the registered JavaScript provider", async () => {
    const runtime = createP0CodeIntelligenceRuntime(createP0ProviderPlatform(), {
      debounceMs: 0,
    });
    const file = ARRAY_MAP_LESSON_FIXTURE.files[0]!;
    const entry = ARRAY_MAP_TARGET_CATALOG.mapCall;
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
      expect.objectContaining({ representation: "editor" }),
    ]);
    runtime.dispose();
  });
});
